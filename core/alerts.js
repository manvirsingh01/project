export const DEFAULT_WATCHDOG_MS = 1000;
export const LOW_RELIABILITY_THRESHOLD = 0.8;
export const FRAGMENTATION_THRESHOLD = 20;

export function simulationAlerts(result, { watchdogMs = DEFAULT_WATCHDOG_MS } = {}) {
  const alerts = [];
  if (result.mwcVerdict === "infeasible") alerts.push({ rule: "infeasible", severity: "critical", message: `Infeasible configuration: ${result.device.name} with ${result.algorithm.name}. ${result.mwcReasons?.[0] || ""}`.trim() });
  else if (result.mwcVerdict === "marginal") alerts.push({ rule: "marginal", severity: "warning", message: `Marginal configuration: ${result.device.name} with ${result.algorithm.name}. ${result.mwcReasons?.[0] || ""}`.trim() });
  if (result.algorithm.family === "signature" && Number.isFinite(result.estimatedP99Ms) && result.estimatedP99Ms > watchdogMs) {
    alerts.push({ rule: "tail-latency", severity: "warning", message: `Estimated p99 ${result.estimatedP99Ms.toFixed(1)} ms exceeds the ${watchdogMs} ms watchdog threshold.`, metric: "estimatedP99Ms" });
  }
  if (["extrapolated", "unsupported"].includes(result.confidenceTier)) {
    alerts.push({ rule: "confidence", severity: "info", message: `Result confidence tier is ${result.confidenceTier}: ${result.confidenceReason}`, metric: "confidenceTier" });
  }
  return alerts;
}

export function networkAlerts(result) {
  const alerts = [];
  if (result.successProbability < LOW_RELIABILITY_THRESHOLD) alerts.push({ rule: "low-reliability", severity: "warning", message: `Handshake success probability ${(result.successProbability * 100).toFixed(1)}% is below 80%.`, metric: "successProbability" });
  if (result.fragmentCount > FRAGMENTATION_THRESHOLD) alerts.push({ rule: "fragmentation", severity: "info", message: `${result.fragmentCount} fragments exceeds the ${FRAGMENTATION_THRESHOLD}-fragment attention threshold.`, metric: "fragmentCount" });
  return alerts;
}

export function regressionAlert(previous, current, thresholdPercent = 5) {
  if (!Number.isFinite(previous?.estimatedTimeMs) || !Number.isFinite(current?.estimatedTimeMs)) return null;
  const changePercent = ((current.estimatedTimeMs - previous.estimatedTimeMs) / previous.estimatedTimeMs) * 100;
  if (changePercent <= thresholdPercent) return null;
  return { rule: "regression", severity: "warning", message: `Estimated time regressed ${changePercent.toFixed(1)}% versus the previous recorded run (threshold ${thresholdPercent}%).`, metric: "estimatedTimeMs", changePercent };
}
