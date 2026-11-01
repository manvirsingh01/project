const operations = new Set(["keygen", "encapsulate", "decapsulate", "sign", "verify"]);
const measured = new Map();

export function validateMeasuredResult(result) {
  const device = result?.deviceFingerprint;
  const measurement = result?.measurement;
  if (result?.schemaVersion !== 1 || result.data_source !== "measured-live") throw new Error("Unsupported measured result schema or data_source.");
  if (!result.timestamp || !Number.isFinite(Date.parse(result.timestamp))) throw new Error("A valid measurement timestamp is required.");
  if (!device?.id || !device?.firmwareBuildHash || !Number.isFinite(device.clockMHz) || device.clockMHz <= 0) throw new Error("Device id, firmwareBuildHash, and positive clockMHz are required.");
  if (!result.algorithmId || !operations.has(result.operation)) throw new Error("A known algorithmId and supported operation are required.");
  if (result.katPassed !== true || result.referenceCheckPassed !== true) throw new Error("KAT and host reference checks must both pass before importing live measurements.");
  if (!Number.isInteger(measurement?.runCount) || measurement.runCount < 1 || !Number.isFinite(measurement.meanMs) || measurement.meanMs <= 0) throw new Error("Measurement runCount and positive meanMs are required.");
  for (const field of ["cvPercent", "p95Ms", "p99Ms", "stackKB", "flashKB", "energyMJ"]) {
    if (measurement[field] != null && (!Number.isFinite(measurement[field]) || measurement[field] < 0)) throw new Error(`${field} must be a non-negative number.`);
  }
  if (measurement.stackKB != null && device.ramKB != null && measurement.stackKB > device.ramKB) throw new Error("Measured stack exceeds the device RAM fingerprint.");
  if (measurement.flashKB != null && device.flashKB != null && measurement.flashKB > device.flashKB) throw new Error("Measured firmware exceeds the device flash fingerprint.");
  return structuredClone(result);
}

function key(result) { return `${result.deviceFingerprint.id}:${result.algorithmId}:${result.operation}`; }

export function importMeasuredResult(result) {
  const validated = validateMeasuredResult(result);
  measured.set(key(validated), validated);
  return validated;
}

export function getMeasuredResult(deviceId, algorithmId, operation) {
  return operation
    ? measured.get(`${deviceId}:${algorithmId}:${operation}`) ?? null
    : [...measured.values()].filter((result) => result.deviceFingerprint.id === deviceId && result.algorithmId === algorithmId).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0] ?? null;
}

export function listMeasuredResults() { return [...measured.values()]; }
