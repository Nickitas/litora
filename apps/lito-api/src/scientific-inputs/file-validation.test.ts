import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateScientificFile, validateScientificJSON } from "./file-validation.js";
import { scientificInputFormats } from "./format-catalog.js";

test("схемы поддерживают каждую роль и полный закреплённый контур без потери WFS-метаданных", async () => {
  const formats = scientificInputFormats();
  assert.equal(formats.length, 19);
  assert.equal(new Set(formats.map((item) => item.role)).size, 19);
  for (const format of formats.filter((entry) => entry.schema))
    assert.throws(() => validateScientificJSON(format.role, {}), { name: "BadRequestException" });
  const contour = JSON.parse(await readFile(join(__dirname, "../../../lito-cli/data/coastline/black-sea.geojson"), "utf8"));
  assert.doesNotThrow(() => validateScientificJSON("coastline_geojson", contour));
  const valid = { type: "LineString", coordinates: [[39, 43], [40, 44]] };
  assert.doesNotThrow(() => validateScientificJSON("coastline_geojson", valid));
  for (const data of [
    { ...valid, command: "shell" }, { type: "LineString", coordinates: [[43, 39], [44, 40]] },
    { type: "LineString", coordinates: [[39, 43, 0], [40, 44, 0]] },
    { type: "LineString", coordinates: [["39", 43], [40, 44]] },
    { type: "LineString", coordinates: [[39, 43]] },
    { type: "LineString", coordinates: [[NaN, 43], [40, 44]] },
  ]) assert.throws(() => validateScientificJSON("coastline_geojson", data));
  assert.throws(() => validateScientificJSON("export_metadata_json", { schema_version: "future" }));
});

test("JSON входы не приводят строки к числам и не принимают неизвестные поля", () => {
  const condition = { duration_hours: 1, hs_m: 1.2, tp_s: 6, direction_from_deg: 220 };
  assert.doesNotThrow(() => validateScientificJSON("wave_climate", { source: "Реанализ", conditions: [condition] }));
  for (const row of [{ ...condition, tp_s: "6" }, { ...condition, tp_s: -1 }, { ...condition, period: 6 }, { ...condition, direction_from_deg: 360 }])
    assert.throws(() => validateScientificJSON("wave_climate", { source: "Реанализ", conditions: [row] }));
  assert.doesNotThrow(() => validateScientificJSON("bathymetry_grid_json", [{ lat: 43, lon: 39, depth: -100 }]));
  assert.throws(() => validateScientificJSON("bathymetry_grid_json", [{ lat: 43, lon: 39, elevation: -100 }]));
  assert.throws(() => validateScientificJSON("bathymetry_grid_json", []));
  const feature = { type: "Feature", properties: { date: "2020-01-01 00:00:00", satname: "L8", tide_corrected: true,
    water_level_correction: { method: "По посту", source: "Пост", vertical_datum: "Датум" } },
    geometry: { type: "LineString", coordinates: [[39, 43], [40, 44]] } };
  const series = { type: "FeatureCollection", crs: { type: "name", properties: { name: "EPSG:4326" } }, features: [feature, feature] };
  assert.doesNotThrow(() => validateScientificJSON("shoreline_timeseries_geojson", series));
  assert.throws(() => validateScientificJSON("shoreline_timeseries_geojson", { ...series, features: [
    { ...feature, properties: { ...feature.properties, water_level_correction: { ...feature.properties.water_level_correction, unexpected: 1 } } }, feature,
  ] }));
});

test("файловая проверка отклоняет обрывы, BOM, неверный UTF-8 и испорченные таблицы", async () => {
  const directory = await mkdtemp(join(tmpdir(), "litora-input-formats-"));
  const path = join(directory, "input");
  try {
    for (const bytes of [Buffer.from('{"type":'), Buffer.from([0xff]), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{}')])]) {
      await writeFile(path, bytes); await assert.rejects(validateScientificFile(path, "coastline_geojson", "input.geojson"));
    }
    await writeFile(path, 'duration_hours,hs_m,tp_s,direction_from_deg\r\n1,1.2,6,220\r\n');
    await validateScientificFile(path, "wave_climate", "waves.csv");
    for (const values of ['1,1.2,-1,220', '1,1.2,6,360', '0,1.2,6,220']) {
      await writeFile(path, `duration_hours,hs_m,tp_s,direction_from_deg\n${values}\n`);
      await assert.rejects(validateScientificFile(path, "wave_climate", "waves.csv"));
    }
    for (const csv of ['duration_hours,hs_m,tp_s,direction_from_deg\n1,1.2,6\n', 'duration_hours,hs_m,tp_s,direction_from_deg\n1,no,6,220\n', 'duration_hours,hs_m,tp_s,direction_from_deg,unexpected\n1,1.2,6,220,1\n', 'duration_hours,hs_m,tp_s,direction_from_deg\n1,"1.2,6,220\n']) {
      await writeFile(path, csv); await assert.rejects(validateScientificFile(path, "wave_climate", "waves.csv"));
    }
    // После ошибок проверяющая очередь продолжает работать.
    await writeFile(path, JSON.stringify({ type: "LineString", coordinates: [[39, 43], [40, 44]] }));
    await validateScientificFile(path, "coastline_geojson", "coast.geojson");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("MSH проверяется до конца: счётчики, ссылки узлов, блоки и маркеры схемы", async () => {
  const directory = await mkdtemp(join(tmpdir(), "litora-msh-format-")); const path = join(directory, "input.msh");
  const mesh = '$MeshFormat\n2.2 0 8\n$EndMeshFormat\n$Nodes\n4\n1 0 0 0\n2 1 0 0\n3 1 1 0\n4 0 1 0\n$EndNodes\n$Elements\n1\n1 3 0 1 2 3 4\n$EndElements\n';
  try {
    await writeFile(path, mesh); await validateScientificFile(path, "flat_mesh_msh", "input.msh");
    await assert.rejects(validateScientificFile(path, "seabed_msh", "input.msh"));
    for (const invalid of [mesh.replace('3 0 1 2 3 4', '3 0 1 2 3 99'), mesh.replace('$EndNodes', ''), mesh.replace('2.2 0 8', '4.1 0 8'), mesh.replace('$Nodes\n4', '$Nodes\n5')]) {
      await writeFile(path, invalid); await assert.rejects(validateScientificFile(path, "flat_mesh_msh", "input.msh"));
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
