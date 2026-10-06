import { test } from "node:test";
import assert from "node:assert/strict";
import { erosionDemoDefaults } from "@litora/contracts";
import { commandArguments, resourceProfileForKind, scientificReferences, validateCalculation } from "./commands.js";

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
  assert.deepEqual(commandArguments({ kind: "erosion" }, "/tmp/job"), [
    "erosion",
    "--black-sea-sochi",
    "--offline",
    "--steps",
    "3",
    "--breaking-index", "0.78",
    "--berm-height", "2",
    "--closure-depth", "8",
    "--porosity", "0.4",
    "--cerc-coefficient", "0.39",
    "--offshore-sample-distance", "300",
    "--max-shoreline-change", "25",
    "--max-bathymetry-gap", "3000",
    "--output",
    "/tmp/job",
  ]);
  assert.deepEqual(validateCalculation({ kind: "map" }), {
    kind: "map",
    input: {},
  });
});

test("демо CERC принимает ограниченные параметры и экспортирует CSV в каталог worker", () => {
  const job = validateCalculation({ kind: "erosion", input: {
    steps: 12, breakingIndex: 0.85, cercCoefficient: 0.5,
    outputCsv: true, csvFormat: "wide",
  } });
  assert.deepEqual(job.input, {
    ...erosionDemoDefaults, steps: 12, breakingIndex: 0.85,
    cercCoefficient: 0.5, outputCsv: true, csvFormat: "wide",
  });
  const args = commandArguments(job, "/tmp/job");
  assert.deepEqual(args.slice(-6), [
    "--output-csv", "erosion-metrics.csv", "--csv-format", "wide", "--output", "/tmp/job",
  ]);
  assert.ok(args.includes("--offline"));
  assert.ok(!args.includes("--source-url"));
  for (const input of [
    { breakingIndex: 0.5 }, { porosity: 0.7 }, { cercCoefficient: 0 },
    { offshoreSampleDistance: -1 }, { maxBathymetryGap: Infinity },
    { outputCsv: "true" }, { csvFormat: "../../wide" },
    { outputCsv: true, outputPath: "/etc/passwd" },
  ]) assert.throws(() => validateCalculation({ kind: "erosion", input }));
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
    input: { flatMeshInputId: id, bathymetryInputId: id, bathymetryMetadataInputId: id, coastlineInputId: id },
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
