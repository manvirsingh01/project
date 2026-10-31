export const MWC_THRESHOLDS = Object.freeze({
  minimumClockMHz: 48,
  kemRamKB: 64,
  fullAgilityRamKB: 128,
  minimumFlashKB: 512,
  recommendedFlashKB: 1024,
  infeasibleRamRatio: 0.8
});

export function classifyDevice(device, requiredAlgos = []) {
  const cpu = device?.cpu === "custom" ? (device.baseCpu || "cortex-m0+") : device?.cpu;
  if (!device || !["cortex-m0", "cortex-m0+", "cortex-m4", "cortex-m7"].includes(cpu)) {
    return { verdict: "infeasible", reasons: [`Architecture class excluded${device?.cpu ? ` — ${device.cpu}` : ""}. Requires a 32-bit Cortex-M0 or better.`] };
  }
  if (device.clockMHz != null && Number.isFinite(Number(device.clockMHz)) && Number(device.clockMHz) < MWC_THRESHOLDS.minimumClockMHz) {
    return { verdict: "infeasible", reasons: [`Clock ${device.clockMHz} MHz is below the ${MWC_THRESHOLDS.minimumClockMHz} MHz minimum.`] };
  }
  const signing = requiredAlgos.some((algo) => {
    if (algo?.family === "signature") return true;
    const id = typeof algo === "string" ? algo.toLowerCase() : algo?.id?.toLowerCase() || "";
    return ["ml-dsa-", "slh-dsa-", "lms-", "xmss-", "ecdsa-"].some((prefix) => id.startsWith(prefix));
  });
  const ramRequired = signing ? MWC_THRESHOLDS.fullAgilityRamKB : MWC_THRESHOLDS.kemRamKB;
  const ramKB = Number(device.ramKB), flashKB = Number(device.flashKB);
  const kemNearFloor = !signing && ramKB >= 32 && ramKB < ramRequired;
  if (ramKB < ramRequired * MWC_THRESHOLDS.infeasibleRamRatio && !kemNearFloor) {
    return { verdict: "infeasible", reasons: [`RAM ${ramKB} KB is below 80% of the ${ramRequired} KB workload floor.`] };
  }
  if (ramKB < ramRequired) {
    return { verdict: "marginal", reasons: [`RAM ${ramKB} KB is below the ${ramRequired} KB target.`] };
  }
  const peakStackKB = Math.max(0, ...requiredAlgos.map((algo) => Number(typeof algo === "object" ? algo.stackKB : 0)).filter(Number.isFinite));
  if (peakStackKB && ramKB < peakStackKB * 1.2) {
    return { verdict: "marginal", reasons: [`RAM ${ramKB} KB leaves less than 20% headroom over the ${peakStackKB} KB peak stack requirement.`] };
  }
  if (flashKB < MWC_THRESHOLDS.minimumFlashKB) {
    return { verdict: "marginal", reasons: ["Flash is below the 512 KB minimum."] };
  }
  if (flashKB < MWC_THRESHOLDS.recommendedFlashKB) {
    return { verdict: "marginal", reasons: ["Flash is below the 1 MB recommended target."] };
  }
  const clockNote = device.clockMHz == null ? " Reference profile clock is unspecified; the 48 MHz floor is assumed for classification." : "";
  return { verdict: "reliable", reasons: [`Meets the ${ramRequired} KB RAM floor and 1 MB recommended flash target.${clockNote}`] };
}
