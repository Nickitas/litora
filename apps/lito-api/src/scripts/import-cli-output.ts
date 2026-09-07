import "../config/environment.js";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";
import mime from "mime-types";
import { CalculationsRepository } from "../calculations/calculations.repository.js";
import { DatabaseService } from "../infrastructure/database.service.js";
import { ObjectStorageService } from "../infrastructure/object-storage.service.js";

async function filesIn(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : Promise.resolve([path]);
  }));
  return nested.flat();
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  const outputDirectory = resolve(args[0] ?? "../lito-cli/output");
  const kind = args[1] ?? "cli-output-import";
  const database = new DatabaseService();
  const storage = new ObjectStorageService();
  await database.initialize();
  await storage.initialize();
  const repository = new CalculationsRepository(database, storage);
  const jobId = await repository.createImportedJob(kind, `import ${outputDirectory}`);

  try {
    const files = await filesIn(outputDirectory);
    let totalBytes = 0;
    for (const path of files) {
      const info = await stat(path);
      const relativePath = relative(outputDirectory, path).split(sep).join("/");
      const objectKey = `calculations/${jobId}/${relativePath}`;
      const contentType = mime.lookup(path) || "application/octet-stream";
      const digest = await sha256(path);
      await storage.uploadFile(objectKey, path, contentType);
      await repository.addArtifact({
        jobId,
        category: "output",
        filename: basename(path),
        bucket: storage.bucket,
        objectKey,
        contentType,
        sizeBytes: info.size,
        sha256: digest,
      });
      totalBytes += info.size;
    }
    await repository.complete(jobId, { fileCount: files.length, totalBytes, sourceDirectory: outputDirectory });
    console.log(`Импорт завершён: job=${jobId}, файлов=${files.length}, байт=${totalBytes}`);
  } catch (error) {
    await repository.fail(jobId, error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    await database.onModuleDestroy();
  }
}

void main();
