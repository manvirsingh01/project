import test from "node:test";
import assert from "node:assert/strict";
import { algorithms, devices } from "../benchmark-data/index.js";
import { createNumbersOnlyPdf, DATA_EXPORT_COLUMNS, getOperationLevelData, operationDataToCsv } from "../core/dataExport.js";

const find = (rows, deviceId, algoId, operation) => rows.find((row) => row.device_id === deviceId && row.algo_id === algoId && row.operation === operation);

test("operation export generates the documented flat rows for all devices and supported algorithm families", () => {
  const rows = getOperationLevelData(devices);
  assert.equal(rows.length, devices.length * 23);
  assert.deepEqual(Object.keys(rows[0]), DATA_EXPORT_COLUMNS);
  assert.equal(find(rows, "rp2040", "ml-kem-512", "full_handshake").time_ms, 35.7);
  assert.equal(find(rows, "rp2040", "ml-kem-768", "full_handshake").time_ms, 56.6);
  assert.equal(find(rows, "rp2040", "ml-kem-1024", "full_handshake").time_ms, 85.7);
  assert.equal(find(rows, "rp2040", "ml-dsa-44", "sign").time_ms, 158.9);
  assert.equal(find(rows, "rp2040", "ml-dsa-65", "sign").time_ms, 256.6);
  assert.equal(find(rows, "rp2040", "ml-dsa-87", "sign").time_ms, 355.2);
});

test("unpublished phases stay null with explicit reasons; signing variance is phase-scoped", () => {
  const rows = getOperationLevelData(devices);
  const kemPhase = find(rows, "rp2040", "ml-kem-512", "keygen");
  assert.equal(kemPhase.time_ms, null);
  assert.equal(kemPhase.confidence_tier, "unsupported");
  assert.match(kemPhase.note, /no per-phase split/i);
  assert.equal(find(rows, "rp2040", "ml-dsa-44", "keygen").time_ms, null);
  assert.equal(find(rows, "rp2040", "ml-dsa-44", "verify").time_ms, null);
  const sign44 = find(rows, "rp2040", "ml-dsa-44", "sign");
  const sign65 = find(rows, "rp2040", "ml-dsa-65", "sign");
  const sign87 = find(rows, "rp2040", "ml-dsa-87", "sign");
  assert.deepEqual([sign44.cv_percent, sign44.p99_ms], [67.5, 489.9]);
  assert.deepEqual([sign65.cv_percent, sign65.p99_ms], [null, null]);
  assert.deepEqual([sign87.cv_percent, sign87.p99_ms], [null, 1125]);
  assert.equal(find(rows, "attiny-avr", "ml-kem-512", "full_handshake").time_ms, null);
});

test("CSV preserves null explicitly and numbers-only PDF is plain paginated text", () => {
  const rows = getOperationLevelData(devices);
  const csv = operationDataToCsv(rows);
  assert.match(csv.split("\n")[0], /device_id.*operation.*time_ms.*source_citation.*note/);
  assert.match(csv, /"null"/);
  const pdf = Buffer.from(createNumbersOnlyPdf(rows, { dataVersion: "test-data", engineVersion: "test-engine" })).toString("latin1");
  assert.ok(pdf.startsWith("%PDF-1.4"));
  assert.match(pdf, /Devices 10 \| Algorithms 8 \| Data test-data \| Engine test-engine/);
  assert.equal((pdf.match(/\/Type \/Page \/Parent/g) || []).length, 4);
  assert.doesNotMatch(pdf, /\/XObject|\/Image|\bDo\b|\bre f\b/);
  assert.ok(algorithms.some((algo) => algo.id === "ml-kem-1024"));
});
