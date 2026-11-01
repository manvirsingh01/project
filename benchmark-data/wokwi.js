// Only mappings backed by Wokwi's documented board list are marked available.
export const wokwiBoards = {
  rp2040: { board: "wokwi-pi-pico", label: "Raspberry Pi Pico (RP2040)", project: "rp2040", algorithmId: "ml-kem-512", exactness: "same board family" },
  "attiny-avr": { board: "wokwi-attiny85", label: "ATtiny85", project: "attiny-avr", algorithmId: "ml-dsa-44", exactness: "representative part for the AVR device class" },
  stm32l031: { board: "board-st-nucleo-l031k6", label: "NUCLEO-L031K6", project: null, exactness: "same MCU family; different board" }
};

const operations = new Set(["keygen", "encapsulate", "decapsulate", "sign", "verify"]);
const results = new Map();
const keyOf = (entry) => `${entry.deviceId}:${entry.algorithmId}:${entry.operation}`;

export function parseWokwiSerial(output, { deviceId, algorithmId, capturedAt = new Date().toISOString() }) {
  if (!deviceId || !algorithmId) throw new Error("Choose a device and algorithm before importing serial output.");
  const parsed = [];
  for (const line of String(output).split(/\r?\n/)) {
    const match = line.trim().match(/^(keygen|encapsulate|decapsulate|sign|verify),\s*(\d+(?:\.\d+)?)$/);
    if (!match) continue;
    const operation = match[1], elapsedMs = Number(match[2]);
    if (!operations.has(operation) || !Number.isFinite(elapsedMs) || elapsedMs < 0) continue;
    const result = { data_source: "simulated-illustrative", deviceId, algorithmId, operation, elapsedMs, capturedAt, implementation: "stub" };
    results.set(keyOf(result), result);
    parsed.push(result);
  }
  if (!parsed.length) throw new Error("No operation,elapsed_ms rows found in the serial output.");
  return parsed;
}

export function importWokwiResult(result) {
  if (result?.data_source !== "simulated-illustrative" || !result.deviceId || !result.algorithmId || !operations.has(result.operation) || !Number.isFinite(result.elapsedMs) || result.elapsedMs < 0 || !Number.isFinite(Date.parse(result.capturedAt))) {
    throw new Error("Invalid simulated-illustrative result.");
  }
  results.set(keyOf(result), structuredClone(result));
  return result;
}

export function getWokwiResult(deviceId, algorithmId, operation) {
  return operation ? results.get(`${deviceId}:${algorithmId}:${operation}`) ?? null : [...results.values()].filter((item) => item.deviceId === deviceId && item.algorithmId === algorithmId).sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))[0] ?? null;
}

export function listWokwiResults() { return [...results.values()]; }
