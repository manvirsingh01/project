import test from "node:test";
import assert from "node:assert/strict";
import { estimateVariance } from "../core/variance.js";
import { algorithms, clearCache, classifyDevice, devices, getCacheStats, getEngineVersion, makeCustomDevice, modelNetwork, scaleTimeMs, setEngineVersion, simulationCacheKey, simulate } from "../core/index.js";
import { getFullMatrix } from "../core/deviceCatalog.js";

const algo = (id) => algorithms.find((item) => item.id === id);
const board = (id) => devices.find((item) => item.id === id);

test("RP2040 ML-KEM-512 returns its direct anchor exactly", () => {
  const result = simulate("rp2040", "ml-kem-512");
  assert.equal(result.estimatedTimeMs, 35.7);
  assert.equal(result.estimatedStackKB, 9.4);
  assert.equal(result.estimatedEnergyMJ, 2.83);
  assert.equal(result.isExtrapolated, false);
  assert.equal(result.mwcVerdict, "reliable");
  assert.equal(result.algo.id, "ml-kem-512");
});

test("custom M0+ clock scaling changes time and energy while preserving stack", () => {
  const device = makeCustomDevice({ name: "64 MHz node", cpu: "cortex-m0+", ramKB: 96, flashKB: 512, clockMHz: 64 });
  const result = simulate(device, "ml-kem-512");
  assert.ok(Math.abs(result.estimatedTimeMs - 35.7 * 133 / 64) < 1e-10);
  assert.equal(result.estimatedStackKB, 9.4);
  assert.ok(Math.abs(result.estimatedEnergyMJ - 2.83 * 133 / 64) < 1e-10);
  assert.equal(result.isExtrapolated, true);
});

test("M0+ anchors scale across to an M4 target and remain explicitly extrapolated", () => {
  const result = simulate("stm32f4-disco", "ml-kem-512");
  assert.ok(Math.abs(result.estimatedTimeMs - 35.7 * (133 / 168) / 1.85) < 1e-10);
  assert.equal(result.isExtrapolated, true);
  assert.ok(result.assumptions.some((entry) => entry.includes("1.85")));
});

test("architecture scaling applies the inverse DSP factor in both directions", () => {
  const m0ToM4 = scaleTimeMs({ timeMs: 100, anchorCpu: "cortex-m0+", targetCpu: "cortex-m4" });
  const m4ToM0 = scaleTimeMs({ timeMs: 100, anchorCpu: "cortex-m4", targetCpu: "cortex-m0+" });
  assert.ok(Math.abs(m0ToM4 - 100 / 1.85) < 1e-10);
  assert.ok(Math.abs(m4ToM0 - 100 * 1.85) < 1e-10);
});

test("signature CV is copied and p99-to-mean ratio is preserved under scaling", () => {
  const anchor = algo("ml-dsa-44");
  const result = simulate("stm32f4-disco", anchor);
  assert.equal(result.cvPercent, anchor.cvPercent);
  assert.ok(Math.abs(result.estimatedP99Ms / result.estimatedTimeMs - anchor.p99Ms / anchor.timeMs) < 1e-12);
  assert.equal(algo("ml-dsa-44").expectedRejectionIterations, 4.25);
  assert.equal(algo("ml-dsa-65").expectedRejectionIterations, 5.1);
});

test("variance estimates expose p50/p95/p99 and unsupported metrics stay null", () => {
  const result = simulate("rp2040", "ml-dsa-44");
  assert.ok(result.estimatedP50Ms < result.estimatedP95Ms);
  assert.ok(result.estimatedP95Ms < result.estimatedP99Ms);
  assert.equal(result.estimatedP99Ms, 489.9);
  assert.equal(result.varianceModel, "log-normal-approximation");
  assert.equal(result.p95ConfidenceTier, "interpolated");
  const unsupported = simulate("rp2040", "slh-dsa-128s");
  assert.equal(unsupported.confidenceTier, "unsupported");
  assert.equal(unsupported.estimatedTimeMs, null);
  assert.equal(unsupported.unsupportedReason, "No numeric timing anchor exists for this algorithm.");
  assert.equal(unsupported.estimatedFlashKB, null);
  assert.match(unsupported.flashFootprintReason, /did not supply|not supplied/i);
});

test("variance falls back to percentile interpolation when reported p99 disagrees by over 15%", () => {
  const variance = estimateVariance({ meanMs: 100, cvPercent: 10, p99Ms: 300 });
  assert.equal(variance.model, "linear-percentile-fallback");
  assert.equal(variance.p95ConfidenceTier, "interpolated");
  assert.equal(variance.p99Ms, 300);
  assert.ok(variance.p95Ms > variance.p50Ms && variance.p95Ms < variance.p99Ms);
});

test("confidence tiers distinguish measured, interpolated, extrapolated, and unsupported", () => {
  assert.equal(simulate("rp2040", "ml-kem-512").confidenceTier, "measured");
  const custom = makeCustomDevice({ name: "same family", ramKB: 96, flashKB: 512, clockMHz: 64 });
  assert.equal(simulate(custom, "ml-kem-512").confidenceTier, "interpolated");
  assert.equal(simulate("stm32f4-disco", "ml-kem-512").confidenceTier, "extrapolated");
  assert.equal(simulate("rp2040", "lms-h25").confidenceTier, "unsupported");
});

test("anchor-identical custom devices stay interpolated while renamed reference anchors stay measured", () => {
  const custom = makeCustomDevice({ name: "RP2040 clone", cpu: "cortex-m0+", ramKB: 264, flashKB: 2048, clockMHz: 133 });
  assert.equal(simulate(custom, "ml-kem-512").estimatedTimeMs, 35.7);
  assert.equal(simulate(custom, "ml-kem-512").confidenceTier, "interpolated");

  const renamedReference = { ...board("rp2040"), id: "pico-reference-renamed" };
  assert.equal(simulate(renamedReference, "ml-kem-512").confidenceTier, "measured");
});

test("MWC classifies the reference and custom boundary cases", () => {
  assert.equal(classifyDevice(board("cw308-stm32f3"), [algo("ml-dsa-44")]).verdict, "infeasible");
  assert.equal(classifyDevice(board("cw308-stm32f3"), [algo("ml-kem-512")]).verdict, "marginal");
  assert.equal(classifyDevice(board("nucleo-l476rg"), [algo("ml-kem-512"), algo("ml-dsa-44")]).verdict, "reliable");
  assert.equal(classifyDevice({ cpu: "cortex-m0+", clockMHz: 64, ramKB: 100, flashKB: 1024 }, [algo("ml-dsa-44")]).verdict, "infeasible");
  assert.equal(classifyDevice({ cpu: "cortex-m0+", clockMHz: 64, ramKB: 104, flashKB: 1024 }, [algo("ml-dsa-44")]).verdict, "marginal");
  assert.equal(classifyDevice({ cpu: "cortex-m0+", clockMHz: 64, ramKB: 500, flashKB: 256 }, [algo("ml-kem-512")]).verdict, "marginal");
  assert.equal(classifyDevice(board("nucleo-l4r5zi"), [algo("ml-dsa-87")]).verdict, "reliable");
  assert.equal(classifyDevice({ cpu: "cortex-m0+", clockMHz: 47, ramKB: 640, flashKB: 2048 }, []).verdict, "infeasible");
  assert.equal(classifyDevice({ cpu: "custom-8bit", clockMHz: 64, ramKB: 640, flashKB: 2048 }, []).verdict, "infeasible");
  assert.equal(simulate("attiny-avr", "ml-kem-512").confidenceTier, "unsupported");
  assert.equal(simulate("attiny-avr", "ml-kem-512").estimatedTimeMs, null);
  assert.equal(simulate("attiny-avr", "ml-kem-512").estimatedP95Ms, null);
  assert.equal(simulate("attiny-avr", "ml-kem-512").estimatedStackKB, null);
});

test("full matrix sorts devices by RAM and reuses shared simulation fields", () => {
  const matrix = getFullMatrix([board("rp2040"), board("stm32l031")], [algo("ml-kem-512"), algo("ml-dsa-87")]);
  assert.deepEqual(matrix.map((row) => row.device.id), ["stm32l031", "rp2040"]);
  assert.equal(matrix[0].cells[0].mwcVerdict, "infeasible");
  assert.equal(matrix[1].cells[0].estimatedTimeMs, 35.7);
  assert.equal(matrix[1].cells[1].estimatedP99Ms, 1125);
});

test("network model fragments and computes independent packet-loss probability", () => {
  const oneHop = modelNetwork({ payloadBytes: 2420, link: "802.15.4", hops: 1, lossRate: 0.02 });
  const multiHop = modelNetwork({ payloadBytes: 2420, link: "802.15.4", hops: 2, lossRate: 0.02 });
  const kem = modelNetwork({ payloadBytes: 800, link: "802.15.4", hops: 1 });
  assert.equal(oneHop.fragmentCount, 30);
  assert.equal(multiHop.fragmentCount, 54);
  assert.equal(kem.fragmentCount, 10);
  assert.equal(modelNetwork({ payloadBytes: 2420, lossRate: 0 }).successProbability, 1);
  assert.ok(Math.abs(oneHop.successProbability - 0.98 ** 30) < 1e-12);
  assert.ok(multiHop.successProbability < oneHop.successProbability);
});

test("repeated simulation and network calls use bounded memo caches", () => {
  clearCache();
  const first = simulate("rp2040", "ml-kem-512");
  const second = simulate("rp2040", "ml-kem-512");
  assert.deepEqual(second, first);
  modelNetwork({ payloadBytes: 2420, link: "802.15.4", hops: 1, lossRate: 0.02 });
  modelNetwork({ payloadBytes: 2420, link: "802.15.4", hops: 1, lossRate: 0.02 });
  const stats = getCacheStats();
  assert.equal(stats.simulationHits, 1);
  assert.equal(stats.networkHits, 1);
  assert.equal(stats.limit, 500);
});

test("cache keys vary by engine version and custom hardware fingerprint ignores names", () => {
  clearCache();
  const first = makeCustomDevice({ name: "alpha", cpu: "cortex-m0+", ramKB: 96, flashKB: 512, clockMHz: 64 });
  const renamed = { ...first, id: "custom-beta", name: "beta" };
  const one = simulationCacheKey(first, algo("ml-kem-512"));
  assert.equal(one, simulationCacheKey(renamed, algo("ml-kem-512")));
  simulate(first, "ml-kem-512"); simulate(renamed, "ml-kem-512");
  assert.equal(getCacheStats().simulationHits, 1);
  const currentVersion = getEngineVersion();
  setEngineVersion(`${currentVersion}-next`);
  simulate(renamed, "ml-kem-512");
  assert.equal(getCacheStats().simulationMisses, 2);
  setEngineVersion(currentVersion);
  clearCache();
});

test("in-process cache evicts least-recently-used values above 500 entries", () => {
  clearCache();
  for (let bytes = 1; bytes <= 510; bytes++) modelNetwork({ payloadBytes: bytes, link: "802.15.4", hops: 1, lossRate: 0 });
  assert.equal(getCacheStats().networkSize, 500);
});
