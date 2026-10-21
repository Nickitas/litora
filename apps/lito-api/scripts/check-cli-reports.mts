import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { commandArguments, validateCalculation } from "../src/calculations/commands.js";
import { bundledInputProvenance } from "../src/calculations/input-provenance.js";
import { resultMethodFromManifest } from "../src/calculations/result-method.js";
import { assertResultArtifacts } from "../src/worker/result-artifacts.js";

// Реальный Go и те же аргументы/проверки, что у worker; БД и S3 здесь не нужны.
const cliRoot = fileURLToPath(new URL("../../lito-cli/", import.meta.url));
const scratch = await mkdtemp(join(tmpdir(), "litora-cli-reports-"));
const outputArgument = process.argv.indexOf("--output");
const reportRoot = outputArgument < 0 ? join(scratch, "reports") : resolve(process.argv[outputArgument + 1]);
const binary = join(scratch, "lito");

async function filesIn(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : Promise.resolve([path]);
  }));
  return groups.flat();
}

function execute(args: string[], cwd = scratch) {
  return execFileSync(binary, args, { cwd, encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
}

try {
  await mkdir(dirname(reportRoot), { recursive: true });
  await mkdir(reportRoot);
  execFileSync("go", ["build", "-o", binary, "./cmd/lito"], { cwd: cliRoot, timeout: 60_000 });
  await cp(join(cliRoot, "data"), join(scratch, "data"), { recursive: true });
  for (const kind of ["dimension", "map", "coastline_region"])
    await bundledInputProvenance(kind, join(scratch, "data"));

  const coastline = join(scratch, "data/coastline/black-sea.geojson");
  const dataset = join(scratch, "data/examples/sochi-local-segment.geojson");
  const observations = join(scratch, "test-observations.geojson");
  await writeFile(observations, JSON.stringify({ type: "FeatureCollection", features:
    ["2020-01-01T00:00:00Z", "2022-01-01T00:00:00Z"].map((date) => ({
      type: "Feature", properties: { date, satname: "test" },
      geometry: { type: "LineString", coordinates: [[39.6, 43.6], [39.8, 43.61]] },
    })),
  }));
  const id = "33333333-3333-4333-8333-333333333333";
  const cases = [
    { kind: "dimension" }, { kind: "map" },
    { kind: "coastline_region", input: { west: 29, east: 31.5, south: 44.5, north: 46.5 } },
    { kind: "dimension_dataset", input: { datasetId: id } },
    { kind: "dimension_file", input: { coastlineInputId: id } },
    { kind: "map_file", input: { coastlineInputId: id } },
    { kind: "source_file", input: { coastlineInputId: id } },
    { kind: "erosion" }, { kind: "all_demo" },
    { kind: "shoreline_data_audit", input: { observationsInputId: id } },
  ];
  for (const item of cases) {
    const job = validateCalculation(item);
    const output = join(reportRoot, job.kind);
    await mkdir(output);
    const args = commandArguments(job, output, dataset, { coastlineInputId: coastline, observationsInputId: observations });
    const log = execute([...args, "--manifest", join(output, "manifest.json")]);
    await writeFile(join(output, "execution.log"), log);
    const paths = await filesIn(output);
    await assertResultArtifacts(output, job.kind, paths);
    resultMethodFromManifest(await readFile(join(output, "manifest.json")), job.kind);
    const sizes = await Promise.all(paths.map(async (path) => (await stat(path)).size));
    console.log(`${job.kind}: ${paths.length} файлов, ${sizes.reduce((sum, size) => sum + size, 0)} байт; комплект и SHA-256 проверены`);
  }

  const standalone = join(reportRoot, "standalone-dimension");
  execute(["dimension", "--output", standalone, "--manifest", join(standalone, "manifest.json")]);
  const parseDimension = async (path: string) => JSON.parse(await readFile(join(path, "metrics/dimension.metrics.json"), "utf8"));
  const direct = await parseDimension(standalone);
  const worker = await parseDimension(join(reportRoot, "dimension"));
  assert.equal(worker.reference_coastline.points_count, 9635);
  assert.equal(worker.reproducibility.input_geometry_sha256, "f6922e461df150852cc07e6532116cbf37a042ca504d1a40fc908825ee917fe9");
  assert.deepEqual(worker.reproducibility, direct.reproducibility);
  for (const key of ["dimension", "regression_r_squared", "sample_count"])
    assert.equal(worker.iterations[0].dimension[key], direct.iterations[0].dimension[key]);
  assert.ok(Math.abs(worker.iterations[0].dimension.dimension - 1.108395268193275) < 1e-10);
  console.log("CLI = worker = эталон рисунков 1–2: 9 635 точек, D=1.108395268193275, R²=0.9999260180445332");

  const standaloneMap = join(reportRoot, "standalone-map");
  execute(["map", "black-sea", "--output", standaloneMap]);
  assert.deepEqual(await readFile(join(standaloneMap, "metrics/black-sea-coast.geojson")),
    await readFile(join(reportRoot, "map/metrics/black-sea-coast.geojson")));
  console.log("Карта CLI и worker содержит одинаковый полный контур и участок Сочи");

  for (const kind of ["dimension", "erosion", "all_demo"] as const) {
    const output = join(reportRoot, `failure-${kind}`);
    const blocked = join(output, "svg", kind === "erosion" ? "erosion_step_0.svg" : "dimension_0.svg");
    await mkdir(blocked, { recursive: true });
    const job = validateCalculation({ kind, ...(kind === "dimension" ? {} : { input: { steps: 1 } }) });
    const result = spawnSync(binary, [...commandArguments(job, output), "--manifest", join(output, "manifest.json")], {
      cwd: scratch, encoding: "utf8", timeout: 60_000,
    });
    assert.ok(!result.error && result.status !== 0, `${kind}: ошибка записи отчёта должна завершать CLI неуспешно`);
    await assert.rejects(stat(join(output, "manifest.json")), { code: "ENOENT" });
  }
  console.log("Отказ записи dimension/erosion/all: ненулевой код, успешный manifest отсутствует");
  if (outputArgument >= 0) console.log(`Отчёты: ${reportRoot}`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
