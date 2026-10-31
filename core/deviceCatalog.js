import { algorithms, devices } from "../benchmark-data/index.js";
import { classifyDevice } from "./mwcRules.js";
import { simulate } from "./index.js";

export const MATRIX_ALGORITHM_IDS = ["ml-kem-512", "ml-dsa-44", "ml-dsa-87"];
const matrixAlgorithms = MATRIX_ALGORITHM_IDS.map((id) => algorithms.find((item) => item.id === id));

export function generateDeviceCatalog(customDevices = []) {
  return [...devices, ...customDevices].map((device) => ({
    device,
    results: algorithms.map((algorithm) => simulate(device, algorithm))
  }));
}

export function generateStateMatrix(customDevices = []) {
  return [...devices, ...customDevices].map((device) => ({
    device,
    cells: matrixAlgorithms.map((algorithm) => ({
      algorithm,
      ...classifyDevice(device, [algorithm])
    }))
  }));
}

export function getFullMatrix(deviceList = devices, algoList = algorithms) {
  return [...deviceList].sort((a, b) => a.ramKB - b.ramKB || a.name.localeCompare(b.name)).map((device) => ({
    device,
    cells: algoList.map((algorithm) => simulate(device, algorithm))
  }));
}

const safe = (value) => String(value ?? "").normalize("NFKD").replace(/[^\x20-\x7e]/g, "-").replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
const color = { reliable: "0.85 0.95 0.89", marginal: "1 0.93 0.78", infeasible: "0.99 0.87 0.86" };

export function createCatalogPdf({ matrix = generateStateMatrix(), algorithmId = "ml-kem-512", metric = "time", dataVersion = "1.2.0", engineVersion = "1.2.0", generatedAt = new Date() } = {}) {
  const algorithm = algorithms.find((item) => item.id === algorithmId) || matrixAlgorithms[0];
  const rows = matrix;
  const commands = [];
  const text = (x, y, value, size = 8, font = "F1") => commands.push(`BT /${font} ${size} Tf ${x} ${y} Td (${safe(value)}) Tj ET`);
  const rect = (x, y, w, h, fill) => commands.push(`${fill} rg ${x} ${y} ${w} ${h} re f`);
  text(24, 835, "PQC-on-IoT Device Catalog and State Matrix", 17, "F2");
  text(24, 818, `Generated ${generatedAt.toISOString()} | Data ${dataVersion} | Engine ${engineVersion}`, 8);
  const matrixAlgos = rows[0]?.cells.map((cell) => cell.algorithm).filter(Boolean) || matrixAlgorithms;
  const columnStart = Math.min(500, 255 + Math.max(0, 8 - matrixAlgos.length) * 28);
  const columnWidth = Math.min(88, (940 - columnStart) / Math.max(1, matrixAlgos.length));
  text(24, 805, "Device", 8, "F2");
  text(200, 805, "RAM", 8, "F2");
  matrixAlgos.forEach((item, j) => text(columnStart + j * columnWidth, 805, item.name, 6, "F2"));
  rows.forEach(({ device, cells }, i) => {
    const y = 785 - i * 16;
    text(24, y, device.name.slice(0, 29), 7); text(200, y, `${device.ramKB} KB`, 7);
    cells.forEach((cell, j) => { const x = columnStart + j * columnWidth; const verdict = cell.verdict || cell.mwcVerdict || "infeasible"; rect(x, y - 3, columnWidth - 3, 13, color[verdict]); text(x + 3, y, verdict, 6); });
  });

  const values = rows.map(({ device }) => ({ device, result: simulate(device, algorithm) }));
  const chartMetric = metric === "energy" ? "estimatedEnergyMJ" : "estimatedTimeMs";
  const chartUnit = metric === "energy" ? "mJ" : "ms";
  const plotted = values.filter(({ result }) => Number.isFinite(result[chartMetric]));
  const max = Math.max(1, ...plotted.map(({ result }) => result[chartMetric]));
  const chartTop = 575;
  text(24, 600, `${algorithm.name} ${metric === "energy" ? "energy" : "execution time"} (${chartUnit})`, 9, "F2");
  plotted.slice(0, 13).forEach(({ device, result }, i) => {
    const y = chartTop - i * 15, width = Math.max(2, result[chartMetric] / max * 430);
    text(24, y, device.name.slice(0, 23), 6);
    rect(155, y - 2, width, 8, "0.23 0.46 0.86");
    text(592, y, result[chartMetric].toFixed(1), 6);
  });
  text(625, 600, "RAM vs 64 / 128 KB workload floors", 9, "F2");
  const maxRam = Math.max(128, ...rows.map(({ device }) => device.ramKB));
  rows.slice(0, 13).forEach(({ device }, i) => {
    const y = chartTop - i * 15, width = device.ramKB / maxRam * 420;
    text(625, y, device.name.slice(0, 20), 6);
    rect(750, y - 2, width, 8, "0.23 0.65 0.47");
    text(1175, y, `${device.ramKB} KB`, 6);
  });
  text(750 + (64 / maxRam * 420), 392, "64 KB", 6); text(750 + (128 / maxRam * 420), 392, "128 KB", 6);
  text(24, 24, "Projected values use the selected algorithm anchor; excluded architectures have no numeric projection.", 7);
  text(24, 12, `Source: ${algorithm.source}`, 7);

  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1200 850] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  ];
  let pdf = "%PDF-1.4\n", offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
