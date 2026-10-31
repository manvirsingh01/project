export function estimateVariance(anchor, timeScale = 1) {
  const meanMs = anchor.meanMs ?? anchor.timeMs;
  const { cvPercent, p99Ms } = anchor;
  const scaledMean = Number.isFinite(meanMs) ? meanMs * timeScale : null;
  const reportedP99 = Number.isFinite(p99Ms) ? p99Ms * timeScale : null;
  if (!Number.isFinite(scaledMean) || !Number.isFinite(cvPercent)) {
    return { p50Ms: null, p95Ms: null, p99Ms: reportedP99, model: reportedP99 == null ? null : "reported-p99-anchor", p95ConfidenceTier: reportedP99 == null ? null : "unsupported" };
  }
  const sigma = Math.log(1 + cvPercent / 100);
  const mu = Math.log(scaledMean) - sigma ** 2 / 2;
  const p50Ms = Math.exp(mu);
  const derivedP99 = Math.exp(mu + 2.326 * sigma);
  if (reportedP99 != null && Math.abs(derivedP99 - reportedP99) / reportedP99 > 0.15) {
    // The source publishes only a sparse percentile set. Interpolate between
    // the modeled median and the reported p99 instead of presenting a poor fit.
    return {
      p50Ms,
      p95Ms: p50Ms + (reportedP99 - p50Ms) * (45 / 49),
      p99Ms: reportedP99,
      model: "linear-percentile-fallback",
      p95ConfidenceTier: "interpolated"
    };
  }
  return {
    p50Ms,
    p95Ms: Math.exp(mu + 1.645 * sigma),
    p99Ms: reportedP99 ?? derivedP99,
    model: "log-normal-approximation",
    p95ConfidenceTier: "interpolated"
  };
}
