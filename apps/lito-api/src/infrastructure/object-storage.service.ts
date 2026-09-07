import { Injectable, OnModuleInit } from "@nestjs/common";
import { createReadStream } from "node:fs";
import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { environment } from "../config/environment.js";

@Injectable()
export class ObjectStorageService implements OnModuleInit {
  private readonly client = new S3Client({
    endpoint: environment.s3.endpoint,
    region: environment.s3.region,
    forcePathStyle: environment.s3.forcePathStyle,
    credentials: { accessKeyId: environment.s3.accessKey, secretAccessKey: environment.s3.secretKey },
  });

  readonly bucket = environment.s3.bucket;

  async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async uploadFile(objectKey: string, path: string, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      Body: createReadStream(path),
      ContentType: contentType,
    }));
  }

  downloadUrl(objectKey: string, expiresIn = 900): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }), { expiresIn });
  }
}
