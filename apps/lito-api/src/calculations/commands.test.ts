import { test } from "node:test";
import assert from "node:assert/strict";
import { allFileDefaults, cercCalibrationDefaults, cercSiteParameterNames, erosionFileDefaults } from "@litora/contracts";
import { calculationKinds, commandArguments, listCalculationKinds, resourceProfileForKind, scientificReferences, validateCalculation } from "./commands.js";

// Явные значения транспортных тестов; не рекомендация для реального участка.
const cercFixture = Object.fromEntries(cercSiteParameterNames.map((key) => [key, erosionFileDefaults[key]]));

test("каталог сохраняет прежнюю фильтрацию и объясняет выключенные сценарии по явному запросу", () => {
  const legacy = listCalculationKinds(false);
  assert.deepEqual(legacy.map((item) => item.kind), calculationKinds.filter((item) => resourceProfileForKind(item.kind) === "standard").map((item) => item.kind));
  assert.deepEqual(listCalculationKinds(false, "false"), legacy);
  const complete = listCalculationKinds(false, "true");
  assert.equal(complete.length, calculationKinds.length);
  assert.equal(complete.find((item) => item.kind === "dimension")?.available, true);
  assert.equal(complete.find((item) => item.kind === "mesh")?.available, false);
  assert.match(complete.find((item) => item.kind === "mesh")?.unavailableReason ?? "", /Тяжёлые расчёты отключены/);
  assert.equal(listCalculationKinds(true, "true").find((item) => item.kind === "mesh")?.available, true);
  for (const enabled of [true, false]) {
    for (const kind of ["erosion", "all_demo"] as const) {
      const entry = listCalculationKinds(enabled, "true").find((item) => item.kind === kind);
      assert.equal(entry?.selectable, false);
      assert.equal(entry?.available, false);
    }
  }
  assert.ok(!calculationKinds.some((item) => item.available !== undefined));
});

test("каталог отклоняет неверные внешние значения includeUnavailable", () => {
  for (const value of [true, false, "1", "", ["true"], { includeUnavailable: "true" }])
    assert.throws(() => listCalculationKinds(false, value), /includeUnavailable должен быть true или false/);
});

test("пользователь не может передать shell, пути или URL в CLI", () => {
  for (const input of [
    { kind: "bash" },
    { kind: "dimension", input: { input: "/etc/passwd" } },
    { kind: "map", input: { "source-url": "http://internal" } },
    { kind: "erosion", input: { steps: "3;echo hacked" } },
    { kind: "erosion", input: { steps: 10000 } },
    { kind: "dimension", args: [] },
  ]) {
    assert.throws(() => validateCalculation(input));
  }
});
test("допустимый запрос преобразуется в фиксированные аргументы", () => {
  for (const kind of ["dimension", "map"] as const) {
    const args = commandArguments(validateCalculation({ kind }), "/tmp/job");
    assert.equal(args[args.indexOf("--input") + 1], "data/coastline/black-sea.geojson");
    assert.ok(!args.includes("--source-url"));
  }
  assert.deepEqual(validateCalculation({ kind: "map" }), {
    kind: "map",
    input: {},
  });
});

test("аудит ряда принимает только приватные UUID и передаёт worker подготовленные файлы", () => {
  const observationsInputId = "33333333-3333-4333-8333-333333333333";
  const waveInputId = "44444444-4444-4444-8444-444444444444";
  const job = validateCalculation({ kind: "shoreline_data_audit", input: { observationsInputId, waveInputId } });
  assert.deepEqual(scientificReferences(job).map(({ role }) => role), ["shoreline_timeseries_geojson", "wave_climate"]);
  assert.deepEqual(commandArguments(job, "/job/output", undefined,
    { observationsInputId: "/job/observations.json", waveInputId: "/job/waves.csv" },
    { waveInputId: "Локальный архив волн" }), [
    "shoreline-data-audit", "--observations", "/job/observations.json",
    "--wave-input", "/job/waves.csv", "--wave-source", "Локальный архив волн", "--output", "/job/output",
  ]);
  assert.deepEqual(commandArguments(
    validateCalculation({ kind: "shoreline_data_audit", input: { observationsInputId } }),
    "/job/output", undefined, { observationsInputId: "/job/observations.json" },
  ), ["shoreline-data-audit", "--observations", "/job/observations.json", "--output", "/job/output"]);
  const split = validateCalculation({ kind: "shoreline_data_audit", input: { observationsInputId, validationStart: "2022-01-01" } });
  assert.deepEqual(commandArguments(split, "/job/output", undefined, { observationsInputId: "/job/observations.json" }), [
    "shoreline-data-audit", "--observations", "/job/observations.json", "--validation-start", "2022-01-01", "--output", "/job/output",
  ]);
  for (const input of [{}, { observationsInputId: "/etc/passwd" },
    { observationsInputId, waveInputId: "http://internal" },
    { observationsInputId, output: "/tmp/unsafe" },
    { observationsInputId, validationStart: "2022-02-30" },
    { observationsInputId, validationStart: "2022-01-01;echo bad" }]) {
    assert.throws(() => validateCalculation({ kind: "shoreline_data_audit", input }));
  }
});

test("исторические демо нельзя создать или преобразовать в команду worker", () => {
  for (const kind of ["erosion", "all_demo"] as const) {
    assert.equal(calculationKinds.find((item) => item.kind === kind)?.selectable, false);
    for (const input of [undefined, {}, { steps: 3, outputCsv: true }, { coastlineInputId: "33333333-3333-4333-8333-333333333333" }]) {
      const job = { kind, input };
      assert.throws(() => validateCalculation(job), /Демонстрационный сценарий удалён.*реальные входные данные/);
      assert.throws(() => commandArguments(job, "/tmp/job"), /Демонстрационный сценарий удалён/);
    }
  }
});

test("CERC по своим данным принимает только четыре UUID и ограниченные параметры", () => {
  const id = "33333333-3333-4333-8333-333333333333";
  const ids = { coastlineInputId: id, waveInputId: id, bathymetryInputId: id, bathymetryMetadataInputId: id };
  const job = validateCalculation({ kind: "erosion_file", input: { ...cercFixture, ...ids, outputGif: true } });
  assert.deepEqual(job.input, { ...cercFixture, ...ids, ...erosionFileDefaults, outputGif: true });
  assert.equal(resourceProfileForKind(job.kind), "heavy");
  assert.deepEqual(scientificReferences(job).map(({ role }) => role), [
    "coastline_geojson", "wave_climate", "bathymetry_grid_json", "bathymetry_grid_metadata_json",
  ]);
  const paths = {
    coastlineInputId: "/job/coastline.geojson", waveInputId: "/job/waves.csv",
    bathymetryInputId: "/job/erosion-inputs/grid.json", bathymetryMetadataInputId: "/job/erosion-inputs/grid.metadata.json",
  };
  assert.throws(() => commandArguments(job, "/job/output", undefined, paths));
  const args = commandArguments(job, "/job/output", undefined, paths, { waveInputId: "Реанализ 2024" });
  assert.deepEqual(args.slice(0, 7), ["erosion", "--input", paths.coastlineInputId,
    "--wave-input", paths.waveInputId, "--wave-source", "Реанализ 2024"]);
  assert.ok(args.includes(paths.bathymetryInputId));
  assert.ok(args.includes("erosion-animation.gif"));
  assert.ok(!args.includes("--black-sea-sochi"));
  assert.ok(!args.includes("--source-url"));
  for (const bad of [
    { ...cercFixture, ...ids, waveInputId: "/etc/passwd" },
    { ...cercFixture, ...ids, waveInputId: "https://internal.example" },
    { ...cercFixture, ...ids, outputPath: "/tmp/out" },
    { ...cercFixture, ...ids, steps: 49 },
    { ...cercFixture, ...ids, maxBathymetryGap: Infinity },
  ]) assert.throws(() => validateCalculation({ kind: "erosion_file", input: bad }));
});

test("полный волновой ряд по своим входам ограничивает SVG и передаёт серверный бюджет Go", () => {
  const id = "33333333-3333-4333-8333-333333333333";
  const ids = { coastlineInputId: id, waveInputId: id, bathymetryInputId: id, bathymetryMetadataInputId: id };
  const paths = {
    coastlineInputId: "/job/coast.geojson", waveInputId: "/job/waves.csv",
    bathymetryInputId: "/job/grid.json", bathymetryMetadataInputId: "/job/grid.metadata.json",
  };
  for (const kind of ["erosion_file", "all_file"] as const) {
    const job = validateCalculation({ kind, input: {
      ...cercFixture, ...ids, steps: 0, svgMaxFrames: 64, outputCsv: true, csvFormat: "long",
    } });
    const input = job.input;
    assert.ok(input);
    assert.equal(input.steps, 0);
    assert.equal(input.svgMaxFrames, 64);
    const args = commandArguments(job, "/job/output", undefined, paths, { waveInputId: "Наблюдения" });
    assert.deepEqual(args.slice(args.indexOf("--svg-max-frames"), args.indexOf("--svg-max-frames") + 6), [
      "--svg-max-frames", "64", "--max-wave-conditions", "10000", "--max-coast-points", "200",
    ]);
    assert.ok(!args.includes("--output-gif"));
    for (const extra of [
      { svgMaxFrames: 0 }, { svgMaxFrames: 1 }, { svgMaxFrames: 129 },
      { svgMaxFrames: "64" }, { svgMaxFrames: 64, outputGif: true },
      { svgMaxFrames: 64, outputCsv: true, csvFormat: "wide" },
      { svgMaxFrames: 64, maxWaveConditions: 100000 },
      { svgMaxFrames: 64, maxCoastPoints: 100000 },
      { svgMaxFrames: 64, outputPath: "/tmp/foreign" },
    ]) assert.throws(() => validateCalculation({ kind, input: { ...cercFixture, ...ids, steps: 0, ...extra } }));
  }
  assert.throws(() => validateCalculation({ kind: "erosion", input: { steps: 0, svgMaxFrames: 64 } }));
  assert.throws(() => validateCalculation({ kind: "all_demo", input: { steps: 0, svgMaxFrames: 64 } }));
});

test("полный конвейер по своим данным использует четыре приватных входа, а не демо Сочи", () => {
  const id = "33333333-3333-4333-8333-333333333333";
  const ids = { coastlineInputId: id, waveInputId: id, bathymetryInputId: id, bathymetryMetadataInputId: id };
  const job = validateCalculation({ kind: "all_file", input: {
    ...cercFixture, ...ids, steps: 48, outputCsv: true, outputGif: true, modelMaxPoints: 250,
    leftBoundaryTransport: 0.04, rightBoundaryTransport: 0.03,
  } });
  assert.deepEqual(job.input, {
    ...cercFixture, ...ids, ...allFileDefaults, steps: 48, outputCsv: true, outputGif: true, modelMaxPoints: 250,
    leftBoundaryTransport: 0.04, rightBoundaryTransport: 0.03,
  });
  assert.equal(resourceProfileForKind(job.kind), "heavy");
  assert.deepEqual(scientificReferences(job).map(({ role }) => role), [
    "coastline_geojson", "wave_climate", "bathymetry_grid_json", "bathymetry_grid_metadata_json",
  ]);
  const paths = {
    coastlineInputId: "/job/coast.geojson", waveInputId: "/job/waves.csv",
    bathymetryInputId: "/job/erosion-inputs/grid.json", bathymetryMetadataInputId: "/job/erosion-inputs/grid.metadata.json",
  };
  assert.throws(() => commandArguments(job, "/job/output", undefined, paths));
  const args = commandArguments(job, "/job/output", undefined, paths, { waveInputId: "Наблюдения 2024" });
  assert.deepEqual(args.slice(0, 7), ["all", "--input", paths.coastlineInputId,
    "--wave-input", paths.waveInputId, "--wave-source", "Наблюдения 2024"]);
  assert.ok(args.includes(paths.bathymetryInputId));
  assert.ok(args.includes("--model-max-points"));
  assert.ok(args.includes("all-animation.gif"));
  assert.deepEqual(args.slice(args.indexOf("--left-boundary-transport"), args.indexOf("--left-boundary-transport") + 4),
    ["--left-boundary-transport", "0.04", "--right-boundary-transport", "0.03"]);
  assert.ok(!args.includes("--black-sea-sochi"));
  assert.ok(!args.includes("--source-url"));
  for (const bad of [
    { ...cercFixture, ...ids, waveInputId: "/etc/passwd" },
    { ...cercFixture, ...ids, steps: 0 },
    { ...cercFixture, ...ids, steps: 49 },
    { ...cercFixture, ...ids, noModelSimplify: true, modelMaxPoints: 250 },
    { ...cercFixture, ...ids, sourceUrl: "https://internal.example" },
    { ...cercFixture, ...ids, outputPath: "/tmp/out" },
  ]) assert.throws(() => validateCalculation({ kind: "all_file", input: bad }));
});

test("калибровка CERC требует пять собственных файлов и годовое покрытие волн", () => {
  const id = "33333333-3333-4333-8333-333333333333";
  const ids = {
    coastlineInputId: id, waveInputId: id, bathymetryInputId: id,
    bathymetryMetadataInputId: id, observationsInputId: id,
  };
  const job = validateCalculation({ kind: "calibrate_cerc", input: {
    ...cercCalibrationDefaults, ...ids, bathymetryResolution: 0.005, cercCoefficients: "0.2,0.39,0.6",
  } });
  assert.deepEqual(job.input, { ...ids, ...cercCalibrationDefaults,
    bathymetryResolution: 0.005, cercCoefficients: "0.2,0.39,0.6" });
  assert.equal(resourceProfileForKind(job.kind), "heavy");
  assert.deepEqual(scientificReferences(job).map(({ role }) => role), [
    "coastline_geojson", "wave_climate", "bathymetry_grid_json",
    "bathymetry_grid_metadata_json", "shoreline_observations_json",
  ]);
  const paths = {
    coastlineInputId: "/job/coast.geojson", waveInputId: "/job/waves.csv",
    bathymetryInputId: "/job/erosion-inputs/grid.json",
    bathymetryMetadataInputId: "/job/erosion-inputs/grid.metadata.json",
    observationsInputId: "/job/observations.json",
  };
  assert.throws(() => commandArguments(job, "/job/output", undefined, paths));
  const args = commandArguments(job, "/job/output", undefined, paths, { waveInputId: "Реанализ" });
  assert.deepEqual(args.slice(0, 7), ["calibrate-cerc", "--input", paths.coastlineInputId,
    "--wave-input", paths.waveInputId, "--wave-source", "Реанализ"]);
  assert.ok(args.includes(paths.observationsInputId));
  assert.ok(args.includes("--bathymetry-resolution"));
  assert.ok(!args.includes("--source-url"));
  const smallCoefficientJob = validateCalculation({ kind: "calibrate_cerc", input: {
    ...cercCalibrationDefaults, ...ids, bathymetryResolution: 0.005, cercCoefficients: "1e-12, +0.39",
  } });
  assert.equal(smallCoefficientJob.input?.cercCoefficients, "1e-12,+0.39");
  for (const bad of [
    { ...cercFixture, ...ids },
    { ...cercCalibrationDefaults, ...ids, bathymetryResolution: 0, observationsInputId: "/etc/passwd" },
    { ...cercCalibrationDefaults, ...ids, bathymetryResolution: 0.005, minWaveHours: 100 },
    { ...cercCalibrationDefaults, ...ids, bathymetryResolution: 0.005, cercCoefficients: "0.2;echo" },
    { ...cercCalibrationDefaults, ...ids, bathymetryResolution: 0.005, cercCoefficients: "1.1" },
    { ...cercCalibrationDefaults, ...ids, bathymetryResolution: 0.005, outputPath: "/tmp/report" },
  ]) assert.throws(() => validateCalculation({ kind: "calibrate_cerc", input: bad }));
});

test("индексные профили CERC передаются только как приватные UUID с проверенной ролью", () => {
  const id = "33333333-3333-4333-8333-333333333333";
  const profileId = "44444444-4444-4444-8444-444444444444";
  const ids = { coastlineInputId: id, waveInputId: id, bathymetryInputId: id, bathymetryMetadataInputId: id };
  const optional = { sedimentSourcesInputId: profileId, structuresInputId: profileId };
  for (const kind of ["erosion_file", "all_file", "calibrate_cerc"] as const) {
    const input = { ...(kind === "calibrate_cerc" ? cercCalibrationDefaults : cercFixture), ...ids, ...(kind === "calibrate_cerc" ? { observationsInputId: id, bathymetryResolution: 0.005 } : {}),
      ...(kind === "all_file" ? { noModelSimplify: true, modelMaxPoints: 0 } : {}), ...optional };
    const job = validateCalculation({ kind, input });
    assert.deepEqual(scientificReferences(job).slice(-2), [
      { field: "sedimentSourcesInputId", id: profileId, role: "longshore_sediment_sources_json" },
      { field: "structuresInputId", id: profileId, role: "longshore_structures_json" },
    ]);
    const paths = { ...ids, sedimentSourcesInputId: "/worker/sources.json", structuresInputId: "/worker/structures.json",
      observationsInputId: "/worker/observations.json" };
    assert.throws(() => commandArguments(job, "/worker/output", undefined, paths));
    const args = commandArguments(job, "/worker/output", undefined, paths, { waveInputId: "Измерения" });
    assert.deepEqual(args.slice(args.indexOf("--sediment-sources"), args.indexOf("--sediment-sources") + 4),
      ["--sediment-sources", paths.sedimentSourcesInputId, "--structures", paths.structuresInputId]);
    for (const value of ["/etc/passwd", "https://example.org/profile.json", "", 1])
      assert.throws(() => validateCalculation({ kind, input: { ...input, sedimentSourcesInputId: value } }));
  }
  for (const options of [{}, { noModelSimplify: true, modelMaxPoints: 50 }, { noModelSimplify: false, modelMaxPoints: 0 }])
    assert.throws(() => validateCalculation({ kind: "all_file", input: { ...cercFixture, ...ids, ...options, ...optional } }));
  assert.throws(() => validateCalculation({ kind: "erosion", input: optional }));
});

test("пользовательский расчёт принимает только UUID, а путь создаёт worker", () => {
  const datasetId = "33333333-3333-4333-8333-333333333333";
  const job = validateCalculation({
    kind: "dimension_dataset",
    input: { datasetId },
  });
  assert.deepEqual(job, { kind: "dimension_dataset", input: { datasetId } });
  assert.throws(() => commandArguments(job, "/tmp/output"));
  assert.deepEqual(
    commandArguments(job, "/tmp/output", "/tmp/server/input.geojson"),
    [
      "dimension",
      "--input",
      "/tmp/server/input.geojson",
      "--output",
      "/tmp/output",
    ],
  );
  for (const input of [
    {},
    { datasetId: "/etc/passwd" },
    { datasetId: "http://internal" },
    { datasetId, path: "x" },
  ])
    assert.throws(() =>
      validateCalculation({ kind: "dimension_dataset", input }),
    );
});

test("служебная проверка набора использует только UUID и фиксированную Go-команду", () => {
  const datasetId = "33333333-3333-4333-8333-333333333333";
  const job = validateCalculation({ kind: "dataset_validation", input: { datasetId } });
  assert.equal(resourceProfileForKind(job.kind), "standard");
  assert.deepEqual(commandArguments(job, "/job/output", "/job/source.geojson"),
    ["coastline-check", "--input", "/job/source.geojson", "--output", "/job/output"]);
  assert.throws(() => commandArguments(job, "/job/output"));
  for (const input of [{ datasetId: "/etc/passwd" }, { datasetId, output: "/tmp" }, {}])
    assert.throws(() => validateCalculation({ kind: "dataset_validation", input }));
  const scientific = validateCalculation({ kind: "coastline_validation", input: { coastlineInputId: datasetId } });
  assert.equal(resourceProfileForKind(scientific.kind), "heavy");
  assert.deepEqual(commandArguments(scientific, "/job/output", undefined, { coastlineInputId: "/job/source.geojson" }),
    ["coastline-check", "--input", "/job/source.geojson", "--output", "/job/output"]);
});

test("проверка источника и карта своего контура не принимают URL или путь пользователя", () => {
  const id = "33333333-3333-4333-8333-333333333333";
  for (const kind of ["source_file", "map_file"] as const) {
    const job = validateCalculation({ kind, input: { coastlineInputId: id } });
    assert.equal(resourceProfileForKind(kind), "heavy");
    assert.deepEqual(scientificReferences(job), [
      { field: "coastlineInputId", id, role: "coastline_geojson" },
    ]);
    assert.throws(() => commandArguments(job, "/job/output"));
    const args = commandArguments(job, "/job/output", undefined, {
      coastlineInputId: "/job/input.geojson",
    });
    assert.deepEqual(args, kind === "source_file"
      ? ["source", "--input", "/job/input.geojson", "--output", "/job/output"]
      : ["map", "black-sea", "--input", "/job/input.geojson", "--output", "/job/output"]);
    for (const input of [
      { coastlineInputId: "/etc/passwd" },
      { coastlineInputId: "https://internal.example" },
      { coastlineInputId: id, sourceUrl: "https://internal.example" },
    ]) assert.throws(() => validateCalculation({ kind, input }));
  }
});

test("полная цепочка сетка → модель дна использует только загруженные файлы", () => {
  const id = "33333333-3333-4333-8333-333333333333";
  const mesh = validateCalculation({
    kind: "mesh",
    input: { coastlineInputId: id, cellSizes: "1000,500", boundaryDetails: "1000", generators: "frontal-quad" },
  });
  assert.equal(resourceProfileForKind(mesh.kind), "heavy");
  assert.equal(scientificReferences(mesh).length, 1);
  assert.deepEqual(commandArguments(mesh, "/job/output", undefined, { coastlineInputId: "/job/contour.geojson" }), [
    "mesh", "--input", "/job/contour.geojson", "--cell-sizes", "1000,500",
    "--boundary-details", "1000", "--generators", "frontal-quad",
    "--max-cells", "5000000", "--generator-timeout", "20m", "--output", "/job/output",
  ]);
  const build = validateCalculation({
    kind: "seabed_build",
    input: { flatMeshInputId: id, bathymetryInputId: id, bathymetryMetadataInputId: id, coastlineInputId: id, maxSourceDistance: 50000 },
  });
  assert.equal(scientificReferences(build).length, 4);
  assert.deepEqual(commandArguments(build, "/job/output", undefined, {
    flatMeshInputId: "/job/flat.msh", bathymetryInputId: "/job/grid.json",
    bathymetryMetadataInputId: "/job/grid-passport.json", coastlineInputId: "/job/contour.geojson",
  }), [
    "seabed", "build", "--mesh", "/job/flat.msh", "--bathymetry", "/job/grid.json",
    "--bathymetry-metadata", "/job/grid-passport.json", "--coastline", "/job/contour.geojson",
    "--boundary-detail", "1000", "--max-source-distance", "50000", "--coast-transition", "0",
    "--recover-wgs84=true", "--max-nodes", "5000000", "--max-cells", "5000000",
    "--max-output-mib", "2048", "--output", "/job/output/seabed",
  ]);
  for (const bad of [
    { kind: "mesh", input: { coastlineInputId: id, cellSizes: "1000;sh" } },
    { kind: "mesh", input: { coastlineInputId: id, boundaryDetails: "1000,500" } },
    { kind: "seabed_build", input: { flatMeshInputId: "/etc/passwd", bathymetryInputId: id, bathymetryMetadataInputId: id, coastlineInputId: id } },
    { kind: "seabed_build", input: { flatMeshInputId: id, bathymetryInputId: id, bathymetryMetadataInputId: id, coastlineInputId: id, maxOutputMiB: 99999 } },
  ]) assert.throws(() => validateCalculation(bad));
});

test("научные сценарии принимают только UUID файлов и ограниченные параметры", () => {
  const id = "33333333-3333-4333-8333-333333333333";
  const input = {
    modelInputId: id,
    exportMetadataInputId: id,
    sourceMetadataInputId: id,
  };
  const job = validateCalculation({
    kind: "seabed_render",
    input: { ...input, isobaths: "20,50,200", verticalExaggeration: 40, controlPoints: true },
  });
  assert.equal(resourceProfileForKind(job.kind), "heavy");
  assert.equal(scientificReferences(job).length, 3);
  assert.deepEqual(
    commandArguments(job, "/tmp/output", undefined, {
      modelInputId: "/tmp/input.msh",
      exportMetadataInputId: "/tmp/export.json",
      sourceMetadataInputId: "/tmp/source.json",
    }),
    [
      "seabed", "render", "--input", "/tmp/input.msh",
      "--metadata", "/tmp/export.json", "--source-metadata", "/tmp/source.json",
      "--isobaths", "20,50,200", "--vertical-exaggeration", "40",
      "--control-points=true", "--output", "/tmp/output",
    ],
  );
  for (const bad of [
    { ...input, modelInputId: "/etc/passwd" },
    { ...input, sourceMetadataInputId: "https://internal.example" },
    { ...input, isobaths: "20;cat /etc/passwd" },
    { ...input, verticalExaggeration: Infinity },
    { ...input, controlPoints: "true" },
  ])
    assert.throws(() => validateCalculation({ kind: "seabed_render", input: bad }));
});

test("подтипы отчёта сохраняются только у совместимого расчёта и не становятся CLI-флагами", () => {
  const id = "33333333-3333-4333-8333-333333333333";
  const inputs = {
    seabed_render: { modelInputId: id, exportMetadataInputId: id, sourceMetadataInputId: id },
    seabed_adapt: { modelInputId: id, sourceMetadataInputId: id },
  };
  for (const [kind, types] of [["seabed_render", ["bathymetry_overview", "mesh_details"]], ["seabed_adapt", ["size_field"]]] as const) {
    const legacy = validateCalculation({ kind, input: inputs[kind] });
    assert.equal(Object.hasOwn(legacy.input!, "reportType"), false);
    const paths = { modelInputId: "/job/model.msh", exportMetadataInputId: "/job/export.json", sourceMetadataInputId: "/job/source.json" };
    for (const reportType of types) {
      const selected = validateCalculation({ kind, input: { ...inputs[kind], reportType } });
      assert.equal(selected.input?.reportType, reportType);
      assert.deepEqual(commandArguments(selected, "/job/output", undefined, paths), commandArguments(legacy, "/job/output", undefined, paths));
      assert.deepEqual(scientificReferences(selected), scientificReferences(legacy));
    }
    for (const reportType of [null, true, 3, {}, [], "", "../mesh.svg", "mesh_details;curl", ...(kind === "seabed_render" ? ["size_field"] : ["mesh_details", "bathymetry_overview"])]) {
      assert.throws(() => validateCalculation({ kind, input: { ...inputs[kind], reportType } }), /Подтип отчёта/);
    }
  }
  assert.throws(() => validateCalculation({ kind: "dimension", input: { reportType: "mesh_details" } }));
});

test("два отчёта box-counting используют прежние входы и CLI всех трёх сценариев", () => {
  const id = "33333333-3333-4333-8333-333333333333";
  for (const kind of ["dimension", "dimension_dataset", "dimension_file"] as const) {
    const input = kind === "dimension_dataset" ? { datasetId: id } : kind === "dimension_file" ? { coastlineInputId: id } : {};
    const legacy = validateCalculation({ kind, input });
    assert.equal(Object.hasOwn(legacy.input!, "reportType"), false);
    for (const reportType of ["coastline_box_counting", "box_counting_regression"]) {
      const selected = validateCalculation({ kind, input: { ...input, reportType } });
      assert.equal(selected.input?.reportType, reportType);
      assert.deepEqual(commandArguments(selected, "/job/output", "/job/dataset.json", { coastlineInputId: "/job/coastline.json" }), commandArguments(legacy, "/job/output", "/job/dataset.json", { coastlineInputId: "/job/coastline.json" }));
      assert.deepEqual(scientificReferences(selected), scientificReferences(legacy));
    }
    for (const reportType of [null, false, [], {}, 1, "", "size_field", "mesh_details", "../regression.svg"]) {
      assert.throws(() => validateCalculation({ kind, input: { ...input, reportType } }), /Подтип отчёта/);
    }
  }
  for (const kind of ["map", "dataset_validation", "coastline_validation", "seabed_render", "seabed_adapt"]) {
    assert.throws(() => validateCalculation({ kind, input: { reportType: "box_counting_regression" } }));
  }
});

test("сравнение Gmsh ограничивает алгоритмы, размеры и разрешение крупного запуска", () => {
  const id = "33333333-3333-4333-8333-333333333333";
  const input = {
    modelInputId: id, exportMetadataInputId: id,
    fieldCsvInputId: id, fieldReportInputId: id, coastlineInputId: id,
  };
  assert.equal(
    validateCalculation({ kind: "seabed_compare_adaptive", input }).input?.allowLarge,
    false,
  );
  const generated = validateCalculation({
    kind: "seabed_generate_adaptive",
    input: { ...input, generator: "frontal-quad" },
  });
  assert.equal(resourceProfileForKind(generated.kind), "heavy");
  assert.equal(scientificReferences(generated).length, 5);
  assert.deepEqual(commandArguments(generated, "/job/output", undefined, {
    modelInputId: "/job/model.msh", exportMetadataInputId: "/job/export.json",
    fieldCsvInputId: "/job/field.csv", fieldReportInputId: "/job/field.json",
    coastlineInputId: "/job/contour.geojson",
  }), [
    "seabed", "generate-adaptive", "--input", "/job/model.msh",
    "--metadata", "/job/export.json", "--field", "/job/field.csv",
    "--field-report", "/job/field.json", "--coastline", "/job/contour.geojson",
    "--boundary-detail", "200", "--generator", "frontal-quad", "--max-cells", "5000000",
    "--generator-timeout", "20m", "--output", "/job/output",
  ]);
  for (const bad of [
    { ...input, generators: "delaunay;curl internal" },
    { ...input, levelMin: 250, levelMax: 125 },
    { ...input, allowLarge: "true" },
    { ...input, maxCells: 250_000_001 },
    { ...input, gmsh: "/usr/bin/sh" },
    { ...input, levels: "../../etc:125:250" },
    { ...input, detailPreset: "../../etc" },
  ])
    assert.throws(() => validateCalculation({ kind: "seabed_compare_adaptive", input: bad }));
  assert.throws(() => validateCalculation({ kind: "seabed_generate_adaptive", input: { ...input, generator: "../bin/sh" } }));
});

test("AI-01 добавляется только к сравнению и получает ограниченные уровни и seed", () => {
  const id = "33333333-3333-4333-8333-333333333333";
  const ids = {
    modelInputId: id, exportMetadataInputId: id, fieldCsvInputId: id,
    fieldReportInputId: id, coastlineInputId: id,
  };
  const job = validateCalculation({ kind: "seabed_compare_adaptive", input: {
    ...ids, levels: "detailed:125:250,coarse:500:1000", generateExpertSet: true,
    expertLevels: "coarse", expertSeed: "study_2026-01",
  } });
  assert.equal(job.input?.generateExpertSet, true);
  assert.equal(job.input?.expertLevels, "coarse");
  const paths = {
    modelInputId: "/job/model.msh", exportMetadataInputId: "/job/export.json",
    fieldCsvInputId: "/job/field.csv", fieldReportInputId: "/job/field.json",
    coastlineInputId: "/job/coast.geojson",
  };
  const args = commandArguments(job, "/job/output", undefined, paths);
  assert.deepEqual(args.slice(args.indexOf("--expert-set"), args.indexOf("--output")), [
    "--expert-set", "--expert-levels", "coarse", "--expert-seed", "study_2026-01",
  ]);
  const ordinary = validateCalculation({ kind: "seabed_compare_adaptive", input: ids });
  assert.equal(ordinary.input?.generateExpertSet, false);
  assert.ok(!commandArguments(ordinary, "/job/output", undefined, paths).includes("--expert-set"));
  for (const invalid of [
    { expertLevels: "coarse" },
    { generateExpertSet: "true" },
    { generateExpertSet: true, expertLevels: "unknown" },
    { generateExpertSet: true, expertLevels: "detailed,detailed" },
    { generateExpertSet: true, expertLevels: "../../etc" },
    { generateExpertSet: true, expertSeed: "../secret" },
    { generateExpertSet: true, expertSeed: "" },
    { generateExpertSet: true, generators: "delaunay" },
  ]) assert.throws(() => validateCalculation({ kind: "seabed_compare_adaptive", input: { ...ids, ...invalid } }));
});

test("рисунок 5 требует AI-01 и карточки выбранных уровня и генератора", () => {
  const id = "33333333-3333-4333-8333-333333333333";
  const ids = {
    modelInputId: id, exportMetadataInputId: id, fieldCsvInputId: id,
    fieldReportInputId: id, coastlineInputId: id,
  };
  const input = {
    ...ids, levels: "coarse:125:250", generators: "delaunay,frontal-quad",
    generateExpertSet: true, expertLevels: "coarse", expertSeed: "article_2026",
    generateFigureFive: true, figureFiveLevel: "coarse", figureFiveGenerator: "delaunay",
  };
  const job = validateCalculation({ kind: "seabed_compare_adaptive", input });
  const paths = {
    modelInputId: "/job/model.msh", exportMetadataInputId: "/job/export.json",
    fieldCsvInputId: "/job/field.csv", fieldReportInputId: "/job/field.json",
    coastlineInputId: "/job/coast.geojson",
  };
  const args = commandArguments(job, "/job/output", undefined, paths);
  assert.deepEqual(args.slice(args.indexOf("--figure-five"), args.indexOf("--output")), [
    "--figure-five", "--figure-five-level", "coarse", "--figure-five-generator", "delaunay",
  ]);
  for (const invalid of [
    { ...input, generateExpertSet: false, expertLevels: undefined, expertSeed: undefined },
    { ...input, figureFiveLevel: "unknown" },
    { ...input, figureFiveGenerator: "parallelograms" },
    { ...input, figureFiveLevel: "../coarse" },
    { ...input, figureFiveGenerator: "https://example.test" },
    { ...input, generateFigureFive: false },
    { ...input, generateFigureFive: "true" },
    { ...input, expertLevels: "detailed", levels: "detailed:200:400,coarse:125:250" },
  ]) assert.throws(() => validateCalculation({ kind: "seabed_compare_adaptive", input: invalid }));
});

test("AI-02 использует только свои шесть UUID и ограниченные пороги Go", () => {
  const id = "33333333-3333-4333-8333-333333333333";
  const ids = {
    ratingsInputId: id, organizerKeyInputId: id, comparisonReportInputId: id,
    modelInputId: id, exportMetadataInputId: id, coastlineInputId: id,
  };
  const job = validateCalculation({ kind: "seabed_assess_ml", input: {
    ...ids, minExpertsPerCard: 3, minTraining: 16, minEvaluation: 14,
    ridgeLambda: 0.5, minRmseImprovement: 0.15,
  } });
  assert.equal(resourceProfileForKind(job.kind), "heavy");
  assert.deepEqual(scientificReferences(job).map(({ role }) => role), [
    "expert_ratings_tsv", "expert_organizer_key_json", "adaptive_comparison_report_json",
    "seabed_msh", "export_metadata_json", "coastline_geojson",
  ]);
  const paths = {
    ratingsInputId: "/job/ratings.tsv", organizerKeyInputId: "/job/organizer-key.json",
    comparisonReportInputId: "/job/comparison.json", modelInputId: "/job/model.msh",
    exportMetadataInputId: "/job/export.json", coastlineInputId: "/job/coast.geojson",
  };
  assert.deepEqual(commandArguments(job, "/job/output", undefined, paths), [
    "seabed", "assess-ml", "--ratings", paths.ratingsInputId,
    "--organizer-key", paths.organizerKeyInputId,
    "--comparison", paths.comparisonReportInputId,
    "--input", paths.modelInputId, "--metadata", paths.exportMetadataInputId,
    "--coastline", paths.coastlineInputId, "--min-experts-per-card", "3",
    "--min-training", "16", "--min-evaluation", "14",
    "--ridge-lambda", "0.5", "--min-rmse-improvement", "0.15",
    "--output", "/job/output",
  ]);
  for (const invalid of [
    { ...ids, ratingsInputId: "/etc/passwd" },
    { ...ids, organizerKeyInputId: "https://internal" },
    { ...ids, minExpertsPerCard: 1 },
    { ...ids, minTraining: 97 },
    { ...ids, minEvaluation: 1 },
    { ...ids, ridgeLambda: 0 },
    { ...ids, minRmseImprovement: 1 },
    { ...ids, comparisonPath: "/tmp/report.json" },
  ]) assert.throws(() => validateCalculation({ kind: "seabed_assess_ml", input: invalid }));
});

test("проверка рельефа получает только свои модели и опорный паспорт", () => {
  const id = "33333333-3333-4333-8333-333333333333";
  const input = {
    modelInputId: id, exportMetadataInputId: id, referenceModelInputId: id,
    referenceMetadataInputId: id, referencePassportInputId: id,
    fieldCsvInputId: id, fieldReportInputId: id,
  };
  const job = validateCalculation({ kind: "seabed_validate", input });
  assert.equal(scientificReferences(job).length, 7);
  assert.equal(resourceProfileForKind(job.kind), "heavy");
  assert.deepEqual(commandArguments(job, "/job/output", undefined, {
    modelInputId: "/job/model.msh", exportMetadataInputId: "/job/export.json",
    referenceModelInputId: "/job/reference.msh", referenceMetadataInputId: "/job/reference-export.json",
    referencePassportInputId: "/job/reference-passport.json", fieldCsvInputId: "/job/field.csv",
    fieldReportInputId: "/job/field.json",
  }), [
    "seabed", "validate", "--input", "/job/model.msh", "--metadata", "/job/export.json",
    "--reference", "/job/reference.msh", "--reference-metadata", "/job/reference-export.json",
    "--reference-passport", "/job/reference-passport.json", "--size-field", "/job/field.csv",
    "--size-field-report", "/job/field.json", "--isobaths", "20,200,1000,2000",
    "--worst-cells", "20", "--max-nearest-distance", "0", "--output", "/job/output",
  ]);
  for (const bad of [
    { ...input, referencePassportInputId: "/etc/passwd" },
    { ...input, isobaths: "20;wget" },
    { ...input, worstCells: 0 },
    { ...input, maxNearestDistance: -1 },
  ]) assert.throws(() => validateCalculation({ kind: "seabed_validate", input: bad }));
});

test("QA-03 получает только пять приватных входов и фиксированные параметры Go", () => {
  const id = "33333333-3333-4333-8333-333333333333";
  const input = {
    flatMeshInputId: id, meshReportInputId: id, coastlineInputId: id,
    bathymetryInputId: id, bathymetryMetadataInputId: id, maxSourceDistance: 50000,
  };
  const job = validateCalculation({ kind: "seabed_check_full", input });
  assert.equal(resourceProfileForKind(job.kind), "heavy");
  assert.equal(scientificReferences(job).length, 5);
  assert.equal(validateCalculation({ kind: "seabed_check_full", input: {
    ...input, isobaths: "20.5,100.25,1000",
  } }).input?.isobaths, "20.5,100.25,1000");
  assert.deepEqual(commandArguments(job, "/job/output", undefined, {
    flatMeshInputId: "/job/flat.msh", meshReportInputId: "/job/mesh.json",
    coastlineInputId: "/job/contour.geojson", bathymetryInputId: "/job/grid.json",
    bathymetryMetadataInputId: "/job/grid-metadata.json",
  }), [
    "seabed", "check-full", "--mesh", "/job/flat.msh",
    "--mesh-report", "/job/mesh.json", "--coastline", "/job/contour.geojson",
    "--bathymetry", "/job/grid.json", "--bathymetry-metadata", "/job/grid-metadata.json",
    "--generator", "frontal-quad", "--target-edge", "1000", "--boundary-detail", "1000",
    "--max-source-distance", "50000", "--coast-transition", "0",
    "--isobaths", "20,50,100,200,500,1000,1500,2000",
    "--vertical-exaggeration", "40", "--control-points=true",
    "--max-mesh-mib", "256", "--output", "/job/output",
  ]);
  for (const bad of [
    { ...input, meshReportInputId: "/tmp/report.json" },
    { ...input, generator: "frontal-quad;sh" },
    { ...input, targetEdge: -1 },
    { ...input, isobaths: "20;curl" },
    { ...input, controlPoints: "false" },
    { ...input, maxMeshMiB: 8192 },
  ]) assert.throws(() => validateCalculation({ kind: "seabed_check_full", input: bad }));
});
