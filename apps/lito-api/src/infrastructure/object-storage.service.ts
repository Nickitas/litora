import { Injectable, OnModuleInit } from "@nestjs/common";
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";
import { environment } from "../config/environment.js";

@Injectable()
export class ObjectStorageService implements OnModuleInit {
  private readonly client = new S3Client({
    endpoint: environment.s3.endpoint,
    region: environment.s3.region,
    forcePathStyle: environment.s3.forcePathStyle,
    credentials: {
      accessKeyId: environment.s3.accessKey,
      secretAccessKey: environment.s3.secretKey,
    },
  });

  readonly bucket = environment.s3.bucket;
  private readonly signingClient = new S3Client({
    endpoint: environment.s3.publicEndpoint,
    region: environment.s3.region,
    forcePathStyle: environment.s3.forcePathStyle,
    credentials: {
      accessKeyId: environment.s3.accessKey,
      secretAccessKey: environment.s3.secretKey,
    },
  });

  async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  async check(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  async initialize(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      if (
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode !== 404
      )
        throw error;
      if (!environment.s3.autoCreateBucket) {
        throw new Error(
          `S3 bucket "${this.bucket}" не найден. Создайте приватный bucket до запуска API.`,
          { cause: error },
        );
      }
      try {
        await this.client.send(
          new CreateBucketCommand({ Bucket: this.bucket }),
        );
      } catch (creationError) {
        if (
          (creationError as { name: string }).name !== "BucketAlreadyOwnedByYou"
        )
          throw creationError;
      }
    }
  }

  async uploadFile(
    objectKey: string,
    path: string,
    contentType: string,
  ): Promise<void> {
    await new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: objectKey,
        Body: createReadStream(path),
        ContentType: contentType,
      },
      queueSize: 2,
      partSize: 16 * 1024 * 1024,
      leavePartsOnError: false,
    }).done();
  }

  async uploadBytes(
    objectKey: string,
    bytes: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: bytes,
        ContentLength: bytes.length,
        ContentType: contentType,
      }),
    );
  }

  async downloadFile(
    objectKey: string,
    path: string,
    maxBytes: number,
  ): Promise<void> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      { abortSignal: AbortSignal.timeout(maxBytes > 512 * 1024 * 1024 ? 1_800_000
        : maxBytes > 100 * 1024 * 1024 ? 600_000 : 30_000) },
    );
    if (
      response.ContentLength !== undefined &&
      response.ContentLength > maxBytes
    )
      throw new Error("Размер сохранённого набора превышает лимит");
    if (!response.Body || !(Symbol.asyncIterator in response.Body))
      throw new Error("S3 не вернул поток набора данных");
    const handle = await open(path, "wx", 0o600);
    let size = 0;
    try {
      const body = response.Body as Readable;
      body.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) body.destroy(new Error("Размер сохранённого набора превышает лимит"));
      });
      await pipeline(body, handle.createWriteStream());
    } finally {
      await handle.close();
    }
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
  }

  async *listObjects(prefix: string): AsyncGenerator<{
    key: string;
    lastModified: Date | undefined;
    etag: string | undefined;
  }> {
    let continuation: string | undefined;
    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuation,
        }),
      );
      for (const item of response.Contents ?? []) {
        if (item.Key)
          yield {
            key: item.Key,
            lastModified: item.LastModified,
            etag: item.ETag,
          };
      }
      if (!response.IsTruncated) break;
      continuation = response.NextContinuationToken;
      if (!continuation)
        throw new Error("S3 не вернул токен следующей страницы списка объектов");
    } while (continuation);
  }

  async headObject(objectKey: string): Promise<{
    lastModified: Date | undefined;
    etag: string | undefined;
  } | undefined> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
      return { lastModified: result.LastModified, etag: result.ETag };
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404)
        return undefined;
      throw error;
    }
  }

  downloadUrl(objectKey: string, expiresIn = 900): Promise<string> {
    return getSignedUrl(
      this.signingClient,
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      { expiresIn },
    );
  }
}
