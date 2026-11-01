import { algorithms, DATA_VERSION, devices, network } from "../benchmark-data/index.js";
import { classifyDevice } from "./mwcRules.js";
import { estimateVariance } from "./variance.js";
export { getMeasuredResult, importMeasuredResult, listMeasuredResults, validateMeasuredResult } from "./measuredResults.js";

export { algorithms, DATA_VERSION, devices, network };
export { classifyDevice } from "./mwcRules.js";
export const CPU_TYPES = ["cortex-m0", "cortex-m0+", "cortex-m4", "cortex-m7", "custom"];
export const ENGINE_VERSION = "1.2.0";
const CACHE_LIMIT = 500;
let activeEngineVersion = ENGINE_VERSION;
const simulationCache = new Map();
const networkCache = new Map();
const cacheCounters = { simulationHits: 0, simulationMisses: 0, networkHits: 0, networkMisses: 0 };
const customCpu = (device) => device.cpu === "custom" ? (device.baseCpu || "cortex-m0+") : device.cpu;
const cpuSpeedFactor = (cpu) => ["cortex-m4", "cortex-m7"].includes(cpu) ? 1.85 : 1;

export function scaleTimeMs({ timeMs, anchorCpu = "cortex-m0+", anchorClockMHz = 133, targetCpu = "cortex-m0+", targetClockMHz = 133 }) {
  return timeMs * (anchorClockMHz / targetClockMHz) * (cpuSpeedFactor(anchorCpu) / cpuSpeedFactor(targetCpu));
}

function cacheRead(cache, key, hitCounter, missCounter) {
  if (!cache.has(key)) { cacheCounters[missCounter]++; return undefined; }
  const value = cache.get(key); cache.delete(key); cache.set(key, value); cacheCounters[hitCounter]++;
  return value;
}
function cacheWrite(cache, key, value) {
  cache.delete(key); cache.set(key, value);
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
}
function deviceFingerprint(device) {
  if (device.isReference) return { id: device.id, cpu: customCpu(device), ramKB: device.ramKB, flashKB: device.flashKB, clockMHz: device.clockMHz, hasDSP: device.hasDSP };
  return { cpu: customCpu(device), ramKB: device.ramKB, flashKB: device.flashKB, clockMHz: device.clockMHz, hasDSP: device.hasDSP };
}
export function simulationCacheKey(device, algo, engineVersion = activeEngineVersion) {
  return JSON.stringify({ device: deviceFingerprint(device), algoId: algo.id, engineVersion, dataVersion: DATA_VERSION });
}
export function networkCacheKey(input, engineVersion = activeEngineVersion) {
  return JSON.stringify({ ...input, engineVersion, dataVersion: DATA_VERSION });
}
export function getEngineVersion() { return activeEngineVersion; }
export function setEngineVersion(version) {
  if (!String(version).trim()) throw new Error("Engine version must be a non-empty string.");
  activeEngineVersion = String(version);
}
export function clearCache() { simulationCache.clear(); networkCache.clear(); for (const key of Object.keys(cacheCounters)) cacheCounters[key] = 0; }
export function getCacheStats() { return { ...cacheCounters, simulationSize: simulationCache.size, networkSize: networkCache.size, limit: CACHE_LIMIT, engineVersion: activeEngineVersion, dataVersion: DATA_VERSION }; }

export function getDevice(id, customDevices = []) {
  return [...devices, ...customDevices].find((d) => d.id === id || d.id.toLowerCase() === String(id).toLowerCase() || d.name.toLowerCase() === String(id).toLowerCase());
}
export function getAlgorithm(id) {
  return algorithms.find((a) => a.id === id || a.name.toLowerCase() === String(id).toLowerCase());
}

export function makeCustomDevice({ name, cpu = "cortex-m0+", ramKB, flashKB, clockMHz, radio = "none" }) {
  if (!name?.trim()) throw new Error("Device name is required.");
  for (const [label, value] of [["RAM", ramKB], ["flash", flashKB], ["clock", clockMHz]]) {
    if (!Number.isFinite(Number(value)) || Number(value) <= 0) throw new Error(`${label} must be a positive number.`);
  }
  if (!CPU_TYPES.includes(cpu)) throw new Error(`Unsupported CPU: ${cpu}`);
  const id = `custom-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || Date.now()}`;
  return { id, name: name.trim(), cpu: cpu === "custom" ? "custom" : cpu, baseCpu: cpu === "custom" ? "cortex-m0+" : undefined, ramKB: Number(ramKB), flashKB: Number(flashKB), clockMHz: Number(clockMHz), hasDSP: ["cortex-m4", "cortex-m7"].includes(cpu), radio, isReference: false, source: null };
}

function computeSimulation(device, algo) {
  if (!device) throw new Error(`Unknown device: ${device}`);
  if (!algo) throw new Error(`Unknown algorithm: ${algo}`);
  const cpu = customCpu(device);
  const architectureExcluded = ["avr-8bit", "msp430-16bit"].includes(device.cpu);
  const hasTimeAnchor = Number.isFinite(algo.timeMs) && !architectureExcluded;
  // Source anchors are M0+ at 133 MHz. Unknown reference-board clocks use
  // 133 MHz as an explicit nominal assumption.
  const targetClock = Number(device.clockMHz) || 133;
  const timeScale = scaleTimeMs({ timeMs: 1, anchorCpu: "cortex-m0+", anchorClockMHz: 133, targetCpu: cpu, targetClockMHz: targetClock });
  const exactAnchor = device.id === "rp2040" && Number(device.clockMHz) === 133 && hasTimeAnchor;
  const estimatedTimeMs = hasTimeAnchor ? algo.timeMs * timeScale : null;
  const estimatedEnergyMJ = Number.isFinite(algo.energyMJ) && hasTimeAnchor ? algo.energyMJ * timeScale : (hasTimeAnchor ? algo.energyMJ : null);
  const estimatedStackKB = algo.stackKB ?? null;
  const variance = architectureExcluded ? { p50Ms: null, p95Ms: null, p99Ms: null, p95ConfidenceTier: "unsupported", model: "unsupported architecture" } : estimateVariance(algo, timeScale);
  const mwc = classifyDevice(device, [algo]);
  const baseTier = !hasTimeAnchor ? "unsupported" : exactAnchor ? "measured" : ["cortex-m0", "cortex-m0+"].includes(cpu) ? "interpolated" : "extrapolated";
  const confidenceTier = variance.model === "linear-percentile-fallback" ? "interpolated" : baseTier;
  const confidenceReason = architectureExcluded ? `Unsupported for numeric simulation: architecture class excluded (${device.cpu}).` : variance.model === "linear-percentile-fallback" ? "The log-normal p99 estimate differed from the reported p99 by more than 15%; percentile interpolation was used." : confidenceTier === "measured" ? "Directly matches the RP2040 @133 MHz literature anchor." : confidenceTier === "interpolated" ? "Scaled from an M0+ anchor on the same CPU feature family." : confidenceTier === "extrapolated" ? "Scaled from an M0+ anchor across a CPU feature family." : "No numeric timing anchor exists for this algorithm.";
  return {
    device, algorithm: algo, algo, engineVersion: activeEngineVersion, dataVersion: DATA_VERSION,
    estimatedTimeMs, estimatedStackKB: architectureExcluded ? null : estimatedStackKB, estimatedFlashKB: algo.flashFootprintKB ?? null, estimatedEnergyMJ,
    estimatedP50Ms: variance.p50Ms, estimatedP95Ms: variance.p95Ms, estimatedP99Ms: variance.p99Ms,
    p95ConfidenceTier: variance.p95ConfidenceTier, varianceModel: variance.model,
    flashFootprintReason: algo.flashFootprintReason ?? "The source notes did not supply a per-algorithm flash footprint.",
    cvPercent: algo.cvPercent, expectedRejectionIterations: algo.expectedRejectionIterations ?? null,
    payloadBytes: algo.payloadBytes, mwcVerdict: mwc.verdict, mwcReasons: mwc.reasons,
    confidenceTier, confidenceReason,
    isExtrapolated: confidenceTier === "interpolated" || confidenceTier === "extrapolated",
    unsupportedReason: confidenceTier === "unsupported" ? confidenceReason : null,
    assumptions: [
      ...(device.clockMHz == null ? ["Reference device clock is unspecified; 133 MHz was assumed for time projection and the 48 MHz MWC eligibility floor."] : []),
      ...(architectureExcluded ? [confidenceReason] : []),
      ...(cpu === "cortex-m4" || cpu === "cortex-m7" ? ["Cortex-M4/M7 speedup modeled as 1.85× over M0+."] : []),
      ...(device.id.startsWith("custom-") ? ["Custom-device result is extrapolated from M0+ literature anchors."] : []),
      ...(!hasTimeAnchor ? ["No numeric time anchor was supplied for this algorithm."] : [])
    ]
  };
}

export function simulate(deviceOrId, algoOrId, customDevices = [], { cache = true } = {}) {
  const device = typeof deviceOrId === "string" ? getDevice(deviceOrId, customDevices) : deviceOrId;
  const algo = typeof algoOrId === "string" ? getAlgorithm(algoOrId) : algoOrId;
  if (!device) throw new Error(`Unknown device: ${deviceOrId}`);
  if (!algo) throw new Error(`Unknown algorithm: ${algoOrId}`);
  const key = simulationCacheKey(device, algo);
  const cached = cache ? cacheRead(simulationCache, key, "simulationHits", "simulationMisses") : undefined;
  if (cached) return { ...cached, device, algorithm: algo, algo };
  const result = computeSimulation(device, algo);
  if (cache) cacheWrite(simulationCache, key, result);
  return result;
}

function computeNetwork({ payloadBytes, link = "802.15.4", hops = 1, lossRate = 0, loraPayloadBytes = network.loraPayloadDefaultBytes }) {
  const bytes = Number(payloadBytes), hopCount = Math.max(1, Math.floor(Number(hops)));
  const loss = Number(lossRate);
  if (!Number.isFinite(bytes) || bytes < 0) throw new Error("Payload size must be a non-negative number of bytes.");
  if (!Number.isFinite(loss) || loss < 0 || loss > 1) throw new Error("Packet loss must be between 0 and 1.");
  if (!Number.isFinite(hopCount)) throw new Error("Hop count must be a positive number.");
  const perFrame = link === "802.15.4" ? (hopCount > 1 ? 45 : 81) : link === "lora" ? Number(loraPayloadBytes) : null;
  if (!perFrame || perFrame <= 0) throw new Error(`Unsupported link: ${link}`);
  const fragmentCount = Math.ceil(bytes / perFrame);
  return { payloadBytes: bytes, link, hops: hopCount, effectivePayloadPerFrame: perFrame, fragmentCount, successProbability: Math.pow(1 - loss, fragmentCount), packetLossRate: loss, effectiveThroughputBps: null, model: "Independent per-fragment loss; any lost fragment drops the datagram.", engineVersion: activeEngineVersion, dataVersion: DATA_VERSION };
}
export function modelNetwork(input, { cache = true } = {}) {
  const normalized = { ...input, loraPayloadBytes: input.loraPayloadBytes ?? network.loraPayloadDefaultBytes };
  const key = networkCacheKey(normalized);
  const cached = cache ? cacheRead(networkCache, key, "networkHits", "networkMisses") : undefined;
  if (cached) return cached;
  const result = computeNetwork(normalized);
  if (cache) cacheWrite(networkCache, key, result);
  return result;
}

export function compare(pairs, customDevices = []) {
  if (!Array.isArray(pairs) || pairs.length < 1 || pairs.length > 4) throw new Error("Compare requires 1 to 4 device/algorithm pairs.");
  return pairs.map(({ device, algo }) => simulate(device, algo, customDevices));
}

export function formatValue(value, digits = 1, suffix = "") {
  return Number.isFinite(value) ? `${Number(value.toFixed(digits))}${suffix}` : "Not available";
}
