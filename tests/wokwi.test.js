import test from "node:test";
import assert from "node:assert/strict";
import { getWokwiResult, importWokwiResult, listWokwiResults, parseWokwiSerial } from "../core/wokwi.js";

test("parseWokwiSerial extracts only valid operation and timing rows", () => {
  const rows = parseWokwiSerial("keygen,0.123\nnot-a-row\nencapsulate,0.087\n# comment\ndecapsulate,0.090", {
    deviceId: "wokwi-parser-test", algorithmId: "ml-kem-512"
  });
  assert.equal(rows.length, 3);
  assert.equal(getWokwiResult("wokwi-parser-test", "ml-kem-512", "encapsulate").elapsedMs, 0.087);
});

test("parseWokwiSerial rejects missing identity and serial text without readings", () => {
  assert.throws(() => parseWokwiSerial("garbage", { deviceId: "rp2040", algorithmId: "ml-kem-512" }));
  assert.throws(() => parseWokwiSerial("keygen,1", {}));
});

test("importWokwiResult validates and stores simulated-illustrative results separately", () => {
  assert.throws(() => importWokwiResult({ data_source: "measured-live" }));
  const result = {
    data_source: "simulated-illustrative", deviceId: "wokwi-import-test", algorithmId: "ml-dsa-44",
    operation: "sign", elapsedMs: 12.4, capturedAt: new Date().toISOString(), implementation: "stub"
  };
  const returned = importWokwiResult(result);
  assert.notEqual(listWokwiResults().find((item) => item.deviceId === result.deviceId), returned);
  assert.equal(getWokwiResult(result.deviceId, result.algorithmId, "sign").elapsedMs, 12.4);
  assert.throws(() => importWokwiResult({ ...result, operation: "encrypt" }));
  assert.throws(() => importWokwiResult({ ...result, elapsedMs: -1 }));
});

test("getWokwiResult without an operation returns the latest captured row", () => {
  const older = { data_source: "simulated-illustrative", deviceId: "wokwi-latest-test", algorithmId: "ml-kem-512", operation: "keygen", elapsedMs: 1, capturedAt: "2026-01-01T00:00:00.000Z", implementation: "stub" };
  const newer = { ...older, operation: "encapsulate", elapsedMs: 2, capturedAt: "2026-01-02T00:00:00.000Z" };
  importWokwiResult(older);
  importWokwiResult(newer);
  assert.equal(getWokwiResult(older.deviceId, older.algorithmId).operation, "encapsulate");
});
