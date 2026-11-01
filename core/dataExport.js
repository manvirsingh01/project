import { algorithms, devices } from "../benchmark-data/index.js";
import { simulate } from "./index.js";
import { listMeasuredResults } from "./measuredResults.js";
import { listWokwiResults } from "./wokwi.js";

export const DATA_EXPORT_COLUMNS = [
  "device_id", "device_cpu", "device_ram_kb", "device_flash_kb", "device_clock_mhz",
  "algo_id", "algo_family", "security_level", "operation", "time_ms", "stack_kb",
  "energy_mj", "payload_bytes", "cv_percent", "p99_ms", "mwc_verdict",
  "confidence_tier", "data_source", "device_firmware_hash", "source_citation", "note",
  "value_kind", "anchor_id", "assumptions", "clock_assumed", "flash_footprint_kb",
  "p50_ms", "p95_ms", "expected_iterations", "pk_bytes", "sk_bytes", "ct_or_sig_bytes",
  "handshake_bytes", "mwc_applicable", "mwc_scope"
];

function operationPlan(algo) {
  if (algo.id.startsWith("ml-kem-")) return ["keygen", "encapsulate", "decapsulate", "full_handshake"];
  if (algo.id.startsWith("ml-dsa-")) return ["keygen", "sign", "verify"];
  if (algo.id === "ecdh-p256") return ["full_handshake"];
  if (algo.id === "ecdsa-p256") return ["sign"];
  if (algo.id === "slh-dsa-128s") return ["keygen", "sign", "verify"];
  if (algo.id === "lms-h25") return ["verify"];
  return [];
}

function reportedOperation(algo, operation) {
  if (algo.id.startsWith("ml-kem-") && operation === "full_handshake") return true;
  if (algo.id.startsWith("ml-dsa-") && operation === "sign") return true;
  if (algo.id === "ecdh-p256" && operation === "full_handshake") return true;
  return false;
}

export function getOperationLevelData(deviceList = devices, algoList = algorithms) {
  const rows = [];
  for (const device of deviceList) {
    for (const algo of algoList) {
      for (const operation of operationPlan(algo)) {
        const result = simulate(device, algo);
        const hasMeasurement = reportedOperation(algo, operation);
        const timeMs = hasMeasurement ? result.estimatedTimeMs : null;
        const available = hasMeasurement && Number.isFinite(timeMs);
        const phaseLabel = algo.id.startsWith("ml-kem-")
          ? "source reports only the combined handshake time; no per-phase split is published."
          : "source provides no numeric per-phase figure for this operation.";
        const note = available
          ? operation === "full_handshake" && algo.id.startsWith("ml-kem-") ? "Published combined key-generation, encapsulation, and decapsulation time." : operation === "sign" ? "Published signing mean." : "Published key-agreement figure."
          : hasMeasurement && result.unsupportedReason ? result.unsupportedReason : phaseLabel;
        const payloadApplies = operation === "full_handshake" || operation === "sign" || operation === "verify";
        rows.push({
          device_id: device.id,
          device_cpu: device.cpu,
          device_ram_kb: device.ramKB,
          device_flash_kb: device.flashKB,
          device_clock_mhz: device.clockMHz ?? null,
          algo_id: algo.id,
          algo_family: algo.family,
          security_level: algo.level,
          operation,
          time_ms: available ? timeMs : null,
          stack_kb: available ? result.estimatedStackKB : null,
          energy_mj: available ? result.estimatedEnergyMJ : null,
          payload_bytes: payloadApplies ? algo.payloadBytes ?? null : null,
          cv_percent: available && operation === "sign" ? algo.cvPercent ?? null : null,
          p99_ms: available && operation === "sign" ? result.estimatedP99Ms ?? null : null,
          mwc_verdict: result.mwcVerdict,
          confidence_tier: available ? result.confidenceTier : "unsupported",
          data_source: !available ? "unavailable" : result.isExtrapolated ? "extrapolated" : "literature-anchor",
          device_firmware_hash: null,
          source_citation: algo.source,
          note,
          value_kind: available ? result.confidenceTier === "literature-exact" ? "anchor" : "derived" : "unavailable",
          anchor_id: available ? `design:${algo.id}:m0plus-133` : null,
          assumptions: available ? result.assumptions.join("|") : null,
          clock_assumed: device.clockIsNominal ?? false,
          flash_footprint_kb: result.estimatedFlashKB,
          p50_ms: available ? result.estimatedP50Ms : null,
          p95_ms: available ? result.estimatedP95Ms : null,
          expected_iterations: algo.expectedRejectionIterations ?? null,
          pk_bytes: algo.pkBytes ?? null,
          sk_bytes: algo.skBytes ?? null,
          ct_or_sig_bytes: algo.ctOrSigBytes ?? null,
          handshake_bytes: algo.family === "kem" && algo.level > 0 ? (algo.pkBytes ?? 0) + (algo.ctOrSigBytes ?? 0) : null,
          mwc_applicable: algo.level > 0,
          mwc_scope: available ? "operation" : "algorithm"
        });
      }
    }
  }
  const deviceIds = new Set(deviceList.map((device) => device.id));
  const algoIds = new Set(algoList.map((algo) => algo.id));
  for (const live of listMeasuredResults()) {
    if (!deviceIds.has(live.deviceFingerprint.id) || !algoIds.has(live.algorithmId)) continue;
    const device = live.deviceFingerprint, algo = algoList.find((item) => item.id === live.algorithmId);
    rows.push({
      device_id: device.id, device_cpu: device.cpu ?? null, device_ram_kb: device.ramKB ?? null,
      device_flash_kb: device.flashKB ?? null, device_clock_mhz: device.clockMHz,
      algo_id: algo.id, algo_family: algo.family, security_level: algo.level, operation: live.operation,
      time_ms: live.measurement.meanMs, stack_kb: live.measurement.stackKB ?? null,
      energy_mj: live.measurement.energyMJ ?? null, payload_bytes: algo.payloadBytes ?? null,
      cv_percent: live.measurement.cvPercent ?? null, p99_ms: live.measurement.p99Ms ?? null,
      mwc_verdict: null, confidence_tier: "measured-live", data_source: "measured-live",
      device_firmware_hash: device.firmwareBuildHash, source_citation: "On-device PQC harness",
      note: `${live.measurement.runCount} runs; KAT and host reference checks passed; captured ${live.timestamp}.`,
      value_kind: "measured-live", anchor_id: live.id, assumptions: null, clock_assumed: false,
      flash_footprint_kb: algo.flashFootprintKB ?? null, p50_ms: live.measurement.p50Ms ?? null,
      p95_ms: live.measurement.p95Ms ?? null, expected_iterations: algo.expectedRejectionIterations ?? null,
      pk_bytes: algo.pkBytes ?? null, sk_bytes: algo.skBytes ?? null, ct_or_sig_bytes: algo.ctOrSigBytes ?? null,
      handshake_bytes: algo.family === "kem" && algo.level > 0 ? (algo.pkBytes ?? 0) + (algo.ctOrSigBytes ?? 0) : null,
      mwc_applicable: algo.level > 0, mwc_scope: "measurement"
    });
  }
  for (const simulated of listWokwiResults()) {
    if (!deviceIds.has(simulated.deviceId) || !algoIds.has(simulated.algorithmId)) continue;
    const device = deviceList.find((item) => item.id === simulated.deviceId), algo = algoList.find((item) => item.id === simulated.algorithmId);
    rows.push({
      device_id: device.id, device_cpu: device.cpu, device_ram_kb: device.ramKB,
      device_flash_kb: device.flashKB, device_clock_mhz: device.clockMHz ?? null,
      algo_id: algo.id, algo_family: algo.family, security_level: algo.level,
      operation: simulated.operation, time_ms: simulated.elapsedMs, stack_kb: null,
      energy_mj: null, payload_bytes: algo.payloadBytes ?? null, cv_percent: null,
      p99_ms: null, mwc_verdict: null, confidence_tier: "simulated-illustrative",
      data_source: "simulated-illustrative", device_firmware_hash: null,
      source_citation: "Wokwi dummy workload",
      note: `${simulated.implementation} workload; not cryptographic execution; captured ${simulated.capturedAt}.`,
      value_kind: "simulated-illustrative", anchor_id: simulated.id, assumptions: null, clock_assumed: false,
      flash_footprint_kb: null, p50_ms: null, p95_ms: null, expected_iterations: null,
      pk_bytes: algo.pkBytes ?? null, sk_bytes: algo.skBytes ?? null, ct_or_sig_bytes: algo.ctOrSigBytes ?? null,
      handshake_bytes: algo.family === "kem" && algo.level > 0 ? (algo.pkBytes ?? 0) + (algo.ctOrSigBytes ?? 0) : null,
      mwc_applicable: algo.level > 0, mwc_scope: "illustrative"
    });
  }
  return rows;
}

export function operationDataToCsv(rows) {
  const quote = (value) => `"${String(value ?? "null").replaceAll('"', '""')}"`;
  return [DATA_EXPORT_COLUMNS.map(quote).join(","), ...rows.map((row) => DATA_EXPORT_COLUMNS.map((column) => quote(row[column])).join(","))].join("\n") + "\n";
}

const pdfText = (value) => String(value ?? "—").normalize("NFKD").replaceAll("—", "@@EMDASH@@").replaceAll("–", "-").replaceAll("§", "@@SECTION@@").replace(/[^\x20-\x7e@]/g, "-").replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)").replaceAll("@@EMDASH@@", "\\227").replaceAll("@@SECTION@@", "\\247");
const baseColumnWidths = [82, 78, 40, 43, 45, 80, 52, 28, 75, 48, 42, 45, 48, 42, 44, 65, 74, 80, 85, 260, 330];
const columnWidths = DATA_EXPORT_COLUMNS.map((column, index) => baseColumnWidths[index] ?? (column.length > 20 ? 90 : 68));
const headers = DATA_EXPORT_COLUMNS.map((column) => column.replaceAll("_", " "));

export function createNumbersOnlyPdf(rows, { deviceCount = new Set(rows.map((row) => row.device_id)).size, algorithmCount = new Set(rows.map((row) => row.algo_id)).size, dataVersion = "1.3.0", engineVersion = "1.2.0", generatedAt = new Date() } = {}) {
  const pageWidth = columnWidths.reduce((sum, width) => sum + width, 56), pageHeight = 850, rowHeight = 9, firstY = 775, rowsPerPage = 72;
  const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const pageStreams = [];
  for (let page = 0; page < pageCount; page++) {
    const start = page * rowsPerPage, pageRows = rows.slice(start, start + rowsPerPage), commands = [];
    const text = (x, y, value, size = 5) => commands.push(`BT /F1 ${size} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET`);
    text(28, 820, `Devices ${deviceCount} | Algorithms ${algorithmCount} | Data ${dataVersion} | Engine ${engineVersion} | Generated ${generatedAt.toISOString()}`, 7);
    let x = 28;
    headers.forEach((header, index) => { text(x, 795, header, 4.5); x += columnWidths[index]; });
    pageRows.forEach((row, rowIndex) => {
      let cellX = 28; const y = firstY - rowIndex * rowHeight;
      DATA_EXPORT_COLUMNS.forEach((column, columnIndex) => {
        text(cellX, y, row[column] == null ? "—" : row[column], 4.5);
        cellX += columnWidths[columnIndex];
      });
    });
    if (page === pageCount - 1) text(28, 28, "— = no numeric figure published in the source literature for this operation.", 6);
    pageStreams.push(commands.join("\n"));
  }

  const objects = [null, "<< /Type /Catalog /Pages 2 0 R >>", null, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"];
  const pageRefs = [];
  for (const stream of pageStreams) {
    const pageObject = objects.length + 1, contentObject = pageObject + 1;
    pageRefs.push(`${pageObject} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objects[2] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageCount} >>`;
  let pdf = "%PDF-1.4\n", offsets = [0];
  for (let index = 1; index < objects.length; index++) { offsets.push(pdf.length); pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`; }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
