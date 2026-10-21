import "reflect-metadata";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { basename, join, relative } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import mime from "mime-types";
import { environment } from "../config/environment.js";
import { DatabaseService } from "../infrastructure/database.service.js";
import { ObjectStorageService } from "../infrastructure/object-storage.service.js";
import {
  CalculationsRepository,
  type JobRow,
} from "../calculations/calculations.repository.js";
import { CalculationDeletionService } from "../calculations/calculation-deletion.service.js";
import {
  commandArguments,
  scientificReferences,
  validateCalculation,
} from "../calculations/commands.js";
import {
  assertPinnedSochiInputs,
  bundledInputProvenance,
} from "../calculations/input-provenance.js";
import { resultMethodFromManifest } from "../calculations/result-method.js";
import { DatasetsRepository } from "../datasets/datasets.repository.js";
import { maxDatasetBytes } from "../datasets/validation.js";
import { ScientificInputsRepository } from "../scientific-inputs/scientific-inputs.repository.js";
import { maxScientificInputBytes } from "../scientific-inputs/validation.js";
import { maxReusableArtifactBytes, maxReusableArtifactTotalBytes } from "../scientific-inputs/reusable-artifacts.js";
import {
  assertSupportedInputSchemaVersion,
  calculationResultSchemaVersion,
} from "../schema-versions.js";
import { assertOutputBudget, maxHeavyOutputBytes, maxOutputBytes, maxOutputFiles } from "./output-budget.js";
import { cleanupPartialArtifacts } from "./partial-artifacts.js";
import { isScientificRejection } from "./scientific-rejection.js";
import { stageErosionBathymetry } from "./erosion-inputs.js";
import { auditableCommandLine, redactExecutionLog } from "./command-line.js";
import { assertFullBlackSeaStagingLimit } from "./full-black-sea-inputs.js";
import { includeJsonMetric } from "./output-metrics.js";
import { ExecutionLog } from "./execution-log.js";
import { assertResultArtifacts } from "./result-artifacts.js";
import { markHeavyScratch } from "./scratch-cleanup.js";
import { WorkerPresence } from "./worker-presence.js";

const db = new DatabaseService(),
  storage = new ObjectStorageService();
const repository = new CalculationsRepository(db, storage);
const deletion = new CalculationDeletionService(db, storage);
const datasets = new DatasetsRepository(db, storage);
const scientificInputs = new ScientificInputsRepository(db);
const workerId = randomUUID();
const presence = new WorkerPresence(db, workerId, environment.workerProfile);
let stopping = false;
let active: ChildProcess | undefined;
const shutdown = new AbortController();
function stopProcess() {
  if (active?.pid) {
    try {
      process.kill(-active.pid, "SIGKILL");
    } catch {
      /* Процесс уже завершён. */
    }
  }
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    shutdown.abort();
    stopProcess();
  });

async function filesIn(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await filesIn(path)));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}
async function sha256(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path))
    hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function run(job: JobRow) {
  const directory = join(environment.jobsDirectory, job.id);
  const output = join(directory, "output");
  let ownsDirectory = false;
  let interrupted = false,
    checking = false,
    finished = false,
    log = "";
  let outputFailure: Error | undefined;
  let sensitiveWaveSource = "";
  let outputCheck: Promise<void> | undefined;
  let outputMonitor: ReturnType<typeof setInterval> | undefined;
  const uploadedKeys = new Set<string>();
  const heartbeat = setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      const result = await db.query(
        `UPDATE calculation_jobs SET heartbeat_at=now() WHERE id=$1 AND worker_id=$2 AND status='running' RETURNING id`,
        [job.id, workerId],
      );
      if (!finished && !result.rowCount) {
        interrupted = true;
        stopProcess();
      }
    } catch {
      if (finished) return;
      interrupted = true;
      stopProcess();
    } finally {
      checking = false;
    }
  }, 2000);
  const deadline = setTimeout(() => {
    interrupted = true;
    stopProcess();
  }, environment.jobTimeoutMs);
  try {
    assertSupportedInputSchemaVersion(job.input_schema_version);
    await mkdir(environment.jobsDirectory, { recursive: true });
    await mkdir(directory);
    ownsDirectory = true;
    if (environment.workerProfile === "heavy")
      await markHeavyScratch(directory, job.id);
    await mkdir(output, { recursive: true });
    await cp(
      join(environment.cliDirectory, "data"),
      join(directory, "data"),
      { recursive: true, force: false, errorOnExist: true },
    );
    if (job.kind === "erosion" || job.kind === "all_demo")
      await assertPinnedSochiInputs(join(directory, "data"));
    if (job.kind === "dimension" || job.kind === "map" || job.kind === "coastline_region")
      await bundledInputProvenance(job.kind, join(directory, "data"));
    const validated = validateCalculation({ kind: job.kind, input: job.input });
    let datasetPath: string | undefined;
    let provenance: Record<string, unknown> | undefined;
    if (job.kind === "dimension_dataset" || job.kind === "dataset_validation") {
      if (!job.dataset_id || !job.user_id)
        throw new Error("У расчёта нет набора данных или владельца");
      const dataset = await datasets.getOwned(job.dataset_id, job.user_id);
      datasetPath = join(directory, "input.geojson");
      await storage.downloadFile(
        dataset.object_key,
        datasetPath,
        maxDatasetBytes,
      );
      const inputSize = (await stat(datasetPath)).size;
      const inputHash = await sha256(datasetPath);
      if (inputSize !== dataset.size_bytes || inputHash !== dataset.sha256)
        throw new Error(
          "Контрольная сумма или размер набора не совпадает с паспортом",
        );
      provenance = {
        datasetId: dataset.id,
        datasetSchemaVersion: dataset.schema_version,
        sha256: dataset.sha256,
        files: [
          { path: "input.geojson", sizeBytes: inputSize, sha256: inputHash },
        ],
        source: dataset.source,
        sourceRevision: dataset.source_revision,
        license: dataset.license,
        crs: dataset.crs,
        coordinateUnit: dataset.coordinate_unit,
        pointCount: dataset.point_count,
      };
    }
    const scientificPaths: Record<string, string> = {};
    const scientificSources: Record<string, string> = {};
    const scientificFilenames: Record<string, string> = {};
    const scientificFiles: Record<string, unknown>[] = [];
    let scientificInputBytes = 0;
    for (const reference of scientificReferences(validated)) {
      if (!job.user_id) throw new Error("У расчёта нет владельца");
      const file = await scientificInputs.resolveOwnedSource(
        reference.id, job.user_id, reference.role, storage.bucket,
      );
      assertFullBlackSeaStagingLimit(job.kind, reference.field, reference.role, Number(file.size_bytes));
      scientificInputBytes += Number(file.size_bytes);
      if (scientificInputBytes > maxReusableArtifactTotalBytes)
        throw new Error("Суммарный размер научных входов превышает 4 ГиБ");
      const suffix = reference.role === "seabed_msh" || reference.role === "flat_mesh_msh" ? ".msh"
        : reference.role === "adaptive_field_csv" ||
          (reference.role === "wave_climate" && file.filename.toLowerCase().endsWith(".csv")) ? ".csv" : ".json";
      const filePath = join(directory, `scientific-${reference.field}${suffix}`);
      await storage.downloadFile(file.object_key, filePath,
        file.origin === "artifact" ? maxReusableArtifactBytes : maxScientificInputBytes);
      const size = (await stat(filePath)).size;
      const digest = await sha256(filePath);
      if (size !== Number(file.size_bytes) || digest !== file.sha256)
        throw new Error("Научный файл не совпадает с сохранённым паспортом");
      scientificPaths[reference.field] = filePath;
      scientificSources[reference.field] = file.source;
      scientificFilenames[reference.field] = file.filename;
      scientificFiles.push({
        role: reference.role, id: file.id, filename: file.filename,
        origin: file.origin, ...(file.source_job_id ? { sourceJobId: file.source_job_id } : {}),
        sizeBytes: size, sha256: digest, source: file.source,
        sourceRevision: file.source_revision, license: file.license,
        crs: file.crs, coordinateUnit: file.coordinate_unit,
      });
    }
    if (scientificFiles.length)
      provenance = { files: scientificFiles };
    if (job.kind === "erosion_file" || job.kind === "all_file" || job.kind === "calibrate_cerc") {
      sensitiveWaveSource = scientificSources.waveInputId;
      scientificPaths.bathymetryInputId = await stageErosionBathymetry(
        directory,
        scientificPaths.bathymetryInputId,
        scientificPaths.bathymetryMetadataInputId,
        scientificFilenames.bathymetryInputId,
      );
    }
    if (interrupted || stopping)
      throw new Error("Выполнение прервано до запуска CLI");
    const args = [
      ...commandArguments(
        validated,
        output,
        datasetPath,
        scientificPaths,
        scientificSources,
      ),
      "--manifest",
      join(output, "manifest.json"),
    ];
    const coreVersion = await sha256(environment.cliBinary);
    await db.query(
      "UPDATE calculation_jobs SET command_line=$2,core_version=$3 WHERE id=$1 AND worker_id=$4 AND status='running'",
      [job.id, auditableCommandLine(args), `sha256:${coreVersion}`, workerId],
    );
    await db.query(
      "INSERT INTO calculation_events(job_id,event_type) VALUES($1,'started')",
      [job.id],
    );
    outputMonitor = setInterval(() => {
      if (outputCheck || outputFailure) return;
      outputCheck = assertOutputBudget(output, environment.workerProfile)
        .catch((error: unknown) => {
          outputFailure = error instanceof Error ? error : new Error(String(error));
          stopProcess();
        })
        .finally(() => {
          outputCheck = undefined;
        });
    }, 1000);
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const executionLog = new ExecutionLog();
      active = spawn(environment.cliBinary, args, {
        cwd: directory,
        shell: false,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const append = (stream: "stdout" | "stderr", chunk: Buffer) => {
        executionLog.append(stream, chunk);
        log = executionLog.text;
      };
      active.stdout!.on("data", (chunk: Buffer) => append("stdout", chunk));
      active.stderr!.on("data", (chunk: Buffer) => append("stderr", chunk));
      active.once("error", reject);
      active.once("close", (code) => {
        log = executionLog.finish();
        resolve(code);
      });
    });
    clearInterval(outputMonitor);
    outputMonitor = undefined;
    active = undefined;
    await outputCheck;
    if (outputFailure) throw outputFailure;
    log = redactExecutionLog(log, [sensitiveWaveSource]);
    await writeFile(join(output, "execution.log"), log);
    await assertOutputBudget(output, environment.workerProfile);
    const outputs = await filesIn(output);
    const scientificRejection = exitCode !== 0 && !interrupted && !stopping &&
      await isScientificRejection(job.kind, output);
    if ((exitCode !== 0 && !scientificRejection) || interrupted || stopping)
      throw new Error(
        interrupted
          ? "Расчёт прерван: отмена, потеря связи или превышение времени"
          : `CLI завершился с кодом ${exitCode}. ${log.slice(-2000)}`,
      );
    if (outputs.length <= 1) throw new Error("CLI не создал отчётов");
    if (outputs.length > (environment.workerProfile === "heavy" ? 512 : maxOutputFiles))
      throw new Error("Превышен лимит файлов результата");
    const outputSizes = await Promise.all(
      outputs.map(async (path) => (await stat(path)).size),
    );
    if (
      outputSizes.some((size) => size > (environment.workerProfile === "heavy" ? maxHeavyOutputBytes : maxOutputBytes)) ||
      outputSizes.reduce((sum, size) => sum + size, 0) >
        (environment.workerProfile === "heavy" ? maxHeavyOutputBytes : maxOutputBytes)
    )
      throw new Error("Превышен лимит размера результата");
    const unverifiedRejection = scientificRejection && job.kind !== "dataset_validation" && job.kind !== "coastline_validation";
    const method = unverifiedRejection ? null : resultMethodFromManifest(
      await readFile(join(output, "manifest.json")), validated.kind,
    );
    const verifiedArtifacts = unverifiedRejection ? undefined
      : await assertResultArtifacts(output, validated.kind, outputs);
    if (job.kind !== "dimension_dataset" && job.kind !== "dataset_validation" && scientificFiles.length === 0)
      provenance = {
        ...(await bundledInputProvenance(job.kind, join(directory, "data"))),
      };
    if (job.kind === "erosion" || job.kind === "all_demo")
      await assertPinnedSochiInputs(join(directory, "data"));
    const metrics: Record<string, unknown> = {};
    let totalBytes = 0;
    for (const path of outputs) {
      if (interrupted || stopping) throw new Error("Выполнение прервано");
      const info = await stat(path);
      const filename = relative(output, path);
      const objectKey = `users/${job.id}/${filename}`;
      const contentType = mime.lookup(path) || "application/octet-stream";
      const digest = verifiedArtifacts?.get(filename) ?? await sha256(path);
      await storage.uploadFile(objectKey, path, contentType);
      uploadedKeys.add(objectKey);
      await repository.addArtifact({
        jobId: job.id,
        category: filename.endsWith(".log") ? "log" : "output",
        filename,
        bucket: storage.bucket,
        objectKey,
        contentType,
        sizeBytes: info.size,
        sha256: digest,
      });
      totalBytes += info.size;
      if (includeJsonMetric(filename, info.size)) {
        try {
          metrics[basename(path)] = JSON.parse(await readFile(path, "utf8"));
        } catch {
          /* Некорректный JSON доступен как артефакт. */
        }
      }
    }
    const summary = {
      fileCount: outputs.length,
      totalBytes,
      scenario:
        job.kind === "erosion" || job.kind === "all_demo"
          ? "demo"
          : job.kind === "dimension_dataset" || job.kind === "dataset_validation" || scientificFiles.length > 0
            ? "user-data"
            : "bundled-data",
      ...(provenance ? { provenance } : {}),
      method,
      ...(scientificRejection ? { scientificAccepted: false } : {}),
      metrics,
    };
    const completed = scientificRejection
      ? await db.query(
        `WITH finished AS (UPDATE calculation_jobs SET status='failed',result_summary=$3,result_schema_version=$4,
         error_message=$5,method_id=$6,method_revision=$7,finished_at=now(),updated_at=now()
         WHERE id=$1 AND worker_id=$2 AND status='running' RETURNING id)
         INSERT INTO calculation_events(job_id,event_type,payload)
         SELECT id,'failed',jsonb_build_object('message',$5::text) FROM finished`,
        [job.id, workerId, summary, calculationResultSchemaVersion,
          `Научные критерии не пройдены. ${log.slice(-2000)}`.slice(0, 4000), method?.id ?? null, method?.revision ?? null],
      )
      : await db.query(
        `WITH finished AS (UPDATE calculation_jobs SET status='succeeded',result_summary=$3,result_schema_version=$4,method_id=$5,method_revision=$6,finished_at=now(),updated_at=now()
        WHERE id=$1 AND worker_id=$2 AND status='running' RETURNING id)
        INSERT INTO calculation_events(job_id,event_type) SELECT id,'succeeded' FROM finished`,
        [job.id, workerId, summary, calculationResultSchemaVersion, method?.id ?? null, method?.revision ?? null],
      );
    if (completed.rowCount !== 1)
      throw new Error("Расчёт уже отменён или потерял владельца worker");
    console.log(`Расчёт ${job.id}: ${scientificRejection ? "научные критерии не пройдены" : "готово"}, файлов ${outputs.length}`);
  } catch (error) {
    const message = redactExecutionLog(error instanceof Error ? error.message : String(error), [sensitiveWaveSource]);
    log = redactExecutionLog(log, [sensitiveWaveSource]);
    const leftovers = await cleanupPartialArtifacts(
      job.id,
      uploadedKeys,
      (key) => storage.deleteObject(key),
      (id, key) => repository.removeArtifact(id, key),
    );
    if (leftovers.length)
      console.error(`Не удалось очистить ${leftovers.length} артефактов расчёта ${job.id}`);
    const failed = await db.query(
      `WITH failed AS (UPDATE calculation_jobs SET status='failed',error_message=$3,finished_at=now(),updated_at=now()
      WHERE id=$1 AND worker_id=$2 AND status='running' RETURNING id)
      INSERT INTO calculation_events(job_id,event_type,payload) SELECT id,'failed',jsonb_build_object('message',$3::text) FROM failed`,
      [job.id, workerId, message.slice(0, 4000)],
    );
    if (!failed.rowCount) {
      console.error(`Расчёт ${job.id}: ${message}`);
      return;
    }
    try {
      if (!ownsDirectory) throw new Error("Scratch-каталог не принадлежит этому запуску");
      const path = join(output, "failure.log");
      await mkdir(output, { recursive: true });
      await writeFile(path, `${message}\n${log}`);
      const objectKey = `users/${job.id}/failure.log`;
      await storage.uploadFile(objectKey, path, "text/plain");
      try {
        await repository.addArtifact({
          jobId: job.id,
          category: "log",
          filename: "failure.log",
          bucket: storage.bucket,
          objectKey,
          contentType: "text/plain",
          sizeBytes: (await stat(path)).size,
          sha256: await sha256(path),
        });
      } catch (metadataError) {
        await storage.deleteObject(objectKey);
        throw metadataError;
      }
    } catch (uploadError) {
      console.error(`Не удалось сохранить журнал ${job.id}`, uploadError);
    }
    console.error(`Расчёт ${job.id}: ${message}`);
  } finally {
    finished = true;
    if (outputMonitor) clearInterval(outputMonitor);
    await outputCheck;
    clearInterval(heartbeat);
    clearTimeout(deadline);
    stopProcess();
    active = undefined;
    await db.query(
      `UPDATE calculation_jobs SET worker_id=NULL
       WHERE id=$1 AND worker_id=$2 AND status IN ('succeeded','failed','cancelled')`,
      [job.id, workerId],
    );
    if (ownsDirectory) await rm(directory, { recursive: true, force: true });
  }
}

async function main() {
  await db.initialize();
  await storage.initialize();
  await stat(environment.cliBinary);
  await presence.register();
  let heartbeatInFlight: Promise<void> | undefined;
  const presenceTimer = setInterval(() => {
    if (stopping || heartbeatInFlight) return;
    heartbeatInFlight = presence.heartbeat().catch(() => {
      console.error("Worker потерял связь с реестром процессов; приём новых заданий остановлен");
      stopping = true;
      shutdown.abort();
      stopProcess();
      process.exitCode = 1;
    }).finally(() => {
      heartbeatInFlight = undefined;
    });
  }, 10_000);
  console.log(`Worker ${workerId} (${environment.workerProfile}) готов`);
  let lastAuditPrune = 0;
  try {
    while (!stopping) {
      if (environment.workerProfile === "standard" && Date.now() - lastAuditPrune > 24 * 60 * 60 * 1000) {
        await deletion.pruneCompletedAudit();
        lastAuditPrune = Date.now();
      }
      await db.query(`UPDATE calculation_jobs SET status='failed',error_message='Worker потерял связь. Создайте новый расчёт.',finished_at=now(),updated_at=now()
      WHERE status='running' AND worker_id IS NOT NULL AND heartbeat_at<now()-interval '60 seconds'`);
      await db.query(`UPDATE calculation_jobs SET worker_id=NULL
      WHERE status IN ('succeeded','failed','cancelled') AND worker_id IS NOT NULL
        AND finished_at<now()-interval '1 hour'
        AND (heartbeat_at IS NULL OR heartbeat_at<now()-interval '1 hour')`);
      const item = environment.workerProfile === "standard" ? await deletion.claim() : undefined;
      if (item) await deletion.process(item);
      const job = await repository.claim(workerId, environment.workerProfile);
      if (stopping) {
        if (job) await db.query(
          `UPDATE calculation_jobs SET status='queued',worker_id=NULL,heartbeat_at=NULL,
           started_at=NULL,updated_at=now()
           WHERE id=$1 AND worker_id=$2 AND status='running'`,
          [job.id, workerId]
        );
        break;
      }
      if (job) await run(job);
      else if (!item) {
        try {
          await delay(1000, undefined, { signal: shutdown.signal });
        } catch (error) {
          if (!stopping) throw error;
        }
      }
    }
  } finally {
    clearInterval(presenceTimer);
    await heartbeatInFlight;
    try {
      await presence.stop();
    } catch {
      console.error("Не удалось отметить остановку worker в реестре процессов");
      process.exitCode = 1;
    }
  }
}
main()
  .then(() => console.log(`Worker ${workerId} остановлен`))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.onModuleDestroy());
