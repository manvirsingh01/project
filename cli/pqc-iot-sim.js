#!/usr/bin/env node
import { appendFile, readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { algorithms, DATA_VERSION, ENGINE_VERSION, devices, getAlgorithm, getDevice, makeCustomDevice, modelNetwork, networkCacheKey, simulationCacheKey, simulate } from "../core/index.js";
import { networkAlerts, regressionAlert, simulationAlerts } from "../core/alerts.js";
import { createCatalogPdf, generateDeviceCatalog, generateStateMatrix, getFullMatrix } from "../core/deviceCatalog.js";
import { createNumbersOnlyPdf, getOperationLevelData, operationDataToCsv } from "../core/dataExport.js";

const args = process.argv.slice(2);
const command = args.shift();
function options(tokens) {
  const out = {};
  while (tokens.length) {
    const key = tokens.shift();
    if (key === "-v") { out.verbose = true; continue; }
    if (!key.startsWith("--")) { out._ = key; continue; }
    const name = key.slice(2);
    out[name] = tokens[0] && !tokens[0].startsWith("-") ? tokens.shift() : true;
  }
  return out;
}
const opt = options(args);
const configDir = join(homedir(), ".pqc-iot-sim");
const customPath = join(configDir, "custom-devices.json");
const cachePath = join(configDir, "cache.json");
const historyPath = join(configDir, "history.jsonl");
const MAX_DISK_CACHE = 500;

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}
async function customDevices() { return readJson(customPath, []); }
function json(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
function quote(value) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }

const columns = [
  { name: "Device", value: (r) => r.device.name }, { name: "Algorithm", value: (r) => r.algorithm.name },
  { name: "Mean ms", value: (r) => `${r.confidenceTier === "measured" ? "" : "~"}${r.estimatedTimeMs?.toFixed(1) ?? "Not available"}` },
  { name: "p95 ms", value: (r) => r.estimatedP95Ms?.toFixed(1) ?? "Not available" },
  { name: "p99 ms", value: (r) => r.estimatedP99Ms?.toFixed(1) ?? "Not available" },
  { name: "Stack KB", value: (r) => r.estimatedStackKB ?? "Not available" },
  { name: "Flash KB", value: (r) => r.estimatedFlashKB ?? "Not available" },
  { name: "Energy mJ", value: (r) => r.estimatedEnergyMJ?.toFixed(2) ?? "Not available" },
  { name: "MWC", value: (r) => r.mwcVerdict }, { name: "Confidence", value: (r) => r.confidenceTier }
];
function table(rows, cols = columns) {
  const values = rows.map((row) => cols.map((column) => String(column.value(row) ?? "—")));
  const widths = cols.map((column, i) => Math.max(column.name.length, ...values.map((row) => row[i].length)));
  const line = (row) => row.map((value, i) => value.padEnd(widths[i])).join("  ");
  process.stdout.write(`${line(cols.map((column) => column.name))}\n${widths.map((width) => "─".repeat(width)).join("──")}\n${values.map(line).join("\n")}\n`);
}
function csv(rows) {
  process.stdout.write(`${columns.map((column) => quote(column.name)).join(",")}\n${rows.map((row) => columns.map((column) => quote(column.value(row))).join(",")).join("\n")}\n`);
}
function render(rows, format = "table") { if (format === "json") json(rows); else if (format === "csv") csv(rows); else table(rows); }
function requireOption(name) { if (!opt[name]) throw new Error(`Missing required option --${name}.`); return opt[name]; }
function formatVersion() { return `pqc-iot-sim ${"1.0.0"} · data ${DATA_VERSION} · engine ${ENGINE_VERSION}`; }

let diskCache;
async function getDiskCache() {
  if (diskCache) return diskCache;
  const raw = await readJson(cachePath, {});
  diskCache = new Map(Object.entries(raw));
  return diskCache;
}
async function saveDiskCache() {
  if (!diskCache) return;
  await mkdir(configDir, { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(Object.fromEntries(diskCache), null, 2)}\n`);
}
async function cachedSimulate(deviceId, algoId, profiles, useCache = true) {
  const device = getDevice(deviceId, profiles), algo = getAlgorithm(algoId);
  if (!device) throw new Error(`Unknown device: ${deviceId}`);
  if (!algo) throw new Error(`Unknown algorithm: ${algoId}`);
  if (!useCache) {
    if (opt.verbose) process.stderr.write("Cache bypassed (--no-cache).\n");
    return simulate(device, algo, profiles, { cache: false });
  }
  const cache = await getDiskCache(), key = simulationCacheKey(device, algo);
  if (cache.has(key)) {
    const value = cache.get(key); cache.delete(key); cache.set(key, value);
    if (opt.verbose) process.stderr.write("Persistent cache hit.\n");
    return { ...value, device, algorithm: algo, algo };
  }
  if (opt.verbose) process.stderr.write("Persistent cache miss.\n");
  const result = simulate(device, algo, profiles);
  cache.set(key, result);
  while (cache.size > MAX_DISK_CACHE) cache.delete(cache.keys().next().value);
  await saveDiskCache();
  return result;
}

function writeAlerts(alerts, verbose = Boolean(opt.verbose)) {
  for (const alert of alerts) {
    if (alert.severity === "info" && !verbose) continue;
    const label = alert.severity.toUpperCase();
    const message = `${label}: ${alert.message}`;
    process.stderr.write(process.stderr.isTTY && alert.severity === "critical" ? `\u001b[31m${message}\u001b[0m\n` : `${message}\n`);
  }
}
function exitForAlerts(alerts) {
  if (alerts.some((alert) => alert.severity === "critical") || (opt.strict && alerts.some((alert) => alert.severity === "warning"))) process.exitCode = 1;
}

async function appendHistory(device, algo, result, alerts) {
  const record = { timestamp: new Date().toISOString(), deviceId: device.id, algoId: algo.id, result, alerts, engineVersion: ENGINE_VERSION, dataVersion: DATA_VERSION };
  await mkdir(configDir, { recursive: true });
  await appendFile(historyPath, `${JSON.stringify(record)}\n`);
  return record;
}
async function loadHistory() {
  try { return (await readFile(historyPath, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line)); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}
function previousFor(history, deviceId, algoId) { return [...history].reverse().find((entry) => entry.deviceId === deviceId && entry.algoId === algoId); }

async function notifyWebhook(url, alerts, results = []) {
  if (!url || !alerts.length) return;
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ alerts, results, engineVersion: ENGINE_VERSION, dataVersion: DATA_VERSION }) });
  if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}.`);
}

const report = `# PQC on constrained IoT: benchmark methodology

This simulator encodes supplied benchmark anchors and applies auditable projections. It does not run real cryptography. Data version: ${DATA_VERSION}. Engine version: ${ENGINE_VERSION}.

## 1. Cycle-accurate execution profiling

Literature time anchors are stored at their reported CPU clock. Projection scales time by clock ratio and a documented 1.85× M4/M7 factor.

## 2. Zero-wait-state execution

Anchors preserve the reported setup. Flash wait states and cache effects are not separately simulated.

## 3. Statistical variance analysis

Mean, CV, and published p99 are stored where available. A log-normal approximation derives p50/p95; derived p99 is checked against the supplied p99 and falls back to percentile interpolation if divergence exceeds 15%.

## 4. Static flash and memory tracking

The model reports one firmware flash footprint per algorithm. The supplied source has no numeric per-algorithm flash values, so that metric remains unavailable.

## 5. Dynamic stack instrumentation

Supplied peak stack anchors are stored per algorithm and used by the MWC assessment; missing values remain unavailable.

## 6. Empirical energy modeling

Energy anchors are stored in mJ. Extrapolated energy scales with projected time, preserving the source power assumption.

## 7. Cross-architecture functional equivalence

Unsupported. The simulator produces no cryptographic outputs, so known-answer tests cannot be run here.

## 8. Network fragmentation

6LoWPAN fragment counts and independent-loss success probability are computed from payload, link, hops, and loss rate.

## 9. Side-channel characterization

Unsupported. TVLA, EM, and power-trace analysis are mentioned qualitatively only.

## 10. Hardware/software co-design area-time profiling

Unsupported. FPGA/ASIC LUT, FF, and gate-equivalent area is outside this software MCU model.

## Confidence, caching, and alerts

Measured means a direct RP2040 @133 MHz anchor. Interpolated means scaling within the M0+ feature family. Extrapolated means crossing CPU feature families. Unsupported means there is no numeric time anchor. Derived time/variance values carry a visible approximation tier.

The shared core uses a 500-entry LRU cache. The CLI persists calculation results in ~/.pqc-iot-sim/cache.json using engine and data versions in each key. The --no-cache flag bypasses both layers. Timestamped run history is stored separately and is never cached.

Alerts identify infeasible and marginal MWC cases, p99 above the watchdog threshold, network success below 0.8, fragmentation above 20 frames, confidence drops, and recorded-time regressions. Browser/CLI/webhook notifications do not alter model results.

## References and provenance

The repository includes 08-REFERENCES.md and a grouped citation index in benchmark-data/references.js. The original research report, full bibliography URLs, and exact per-anchor paper mapping are not in this checkout. The References view distinguishes implemented runtime technology from tools/frameworks mentioned only by the source notes.

Source notes: 01-DESIGN.md §§4.1–4.4, 02-IMPLEMENTATION.md §§3 and 6, 05-BENCHMARKING.md, 08-REFERENCES.md.
`;

const help = `PQC-on-IoT Simulator

Commands:
  devices list [--json]
  devices add --name NAME --ram KB --flash KB --clock MHZ [--cpu cortex-m0|cortex-m0+|cortex-m4|cortex-m7]
  matrix [--json] [--export pdf --out FILE] [--metric time|energy] [--algo ID]
  states [--json] [--algo all|kem|signature|ID] [--device-type reference,catalog,custom]
         [--export pdf --out FILE]
  simulate --device ID --algo ID [--json|--csv] [--strict] [--no-cache] [--record]
  network --algo ID --link 802.15.4|lora --hops N --loss RATE [--payload BYTES]
  compare --device ID[,ID...] --algo ID[,ID...] [--json|--csv] [--strict] [--no-cache] [--webhook URL]
  history [--device ID] [--algo ID]
  report [--format md]
  references
  export [--format csv|json] --out FILE (operation-level raw dataset; CSV default)
  export --format pdf --numbers-only --out FILE (plain paginated table)
  export --device ID[,ID...] --algo ID[,ID...] --format csv|json [--out FILE]
  --version

Options: --watchdog-ms N (default 1000), --regression-percent N (default 5),
         --no-cache, --strict (promote warnings to exit 1), --record,
         --webhook URL (explicitly POST batch alerts), -v/--verbose.

Unsupported methodology coverage: cross-architecture KATs (#7), side-channel analysis (#9),
and hardware/software co-design area profiling (#10) are not performed by this simulator.
`;

try {
  if (!command || ["help", "--help", "-h"].includes(command)) process.stdout.write(help);
  else if (command === "--version" || command === "version" || opt.version) process.stdout.write(`${formatVersion()}\n`);
  else if (command === "devices") {
    const action = opt._ ?? "list";
    if (action === "list") {
      const all = [...devices, ...await customDevices()];
      if (opt.json) json(all); else table(all, [{ name: "ID", value: (d) => d.id }, { name: "Device", value: (d) => d.name }, { name: "CPU", value: (d) => d.cpu }, { name: "RAM KB", value: (d) => d.ramKB }, { name: "Flash KB", value: (d) => d.flashKB }, { name: "Clock MHz", value: (d) => d.clockMHz ?? "unspecified" }]);
    } else if (action === "add") {
      const item = makeCustomDevice({ name: requireOption("name"), cpu: opt.cpu || "cortex-m0+", ramKB: requireOption("ram"), flashKB: requireOption("flash"), clockMHz: requireOption("clock"), radio: opt.radio || "none" });
      const all = await customDevices(); all.push(item); generateDeviceCatalog(all); await mkdir(dirname(customPath), { recursive: true }); await writeFile(customPath, `${JSON.stringify(all, null, 2)}\n`); json(item);
    } else throw new Error(`Unknown devices action: ${action}`);
  } else if (command === "matrix") {
    const matrix = generateStateMatrix(await customDevices());
    if (opt.export === "pdf") {
      const output = opt.out || "devices-report.pdf";
      const bytes = createCatalogPdf({ matrix, algorithmId: opt.algo || "ml-kem-512", metric: opt.metric || "time", dataVersion: DATA_VERSION, engineVersion: ENGINE_VERSION });
      await mkdir(dirname(output), { recursive: true }); await writeFile(output, bytes);
      process.stdout.write(`PDF report written to ${output} (${matrix.length} devices).\n`);
    } else if (opt.json) json(matrix);
    else {
      const rows = matrix.map(({ device, cells }) => ({ device: `${device.id} (${device.ramKB} KB)`, kem512: cells[0].verdict, dsa44: cells[1].verdict, dsa87: cells[2].verdict }));
      table(rows, [{ name: "Device (RAM)", value: (row) => row.device }, { name: "ML-KEM-512", value: (row) => row.kem512 }, { name: "ML-DSA-44", value: (row) => row.dsa44 }, { name: "ML-DSA-87", value: (row) => row.dsa87 }]);
    }
  } else if (command === "states") {
    const profiles = await customDevices(), allDevices = [...devices, ...profiles];
    const types = String(opt["device-type"] || "reference,catalog,custom").split(",");
    const selectedDevices = allDevices.filter((device) => {
      const catalog = devices.some((item) => item.id === device.id);
      const type = device.isReference ? "reference" : catalog ? "catalog" : "custom";
      return types.includes(type);
    });
    const algoFilter = String(opt.algo || "all");
    const selectedAlgorithms = algorithms.filter((algo) => {
      const matches = algoFilter === "all" ? true : ["kem", "ml-kem"].includes(algoFilter) ? algo.id.startsWith("ml-kem-") : algoFilter === "signature" ? algo.family === "signature" : algoFilter === "ml-dsa" ? algo.id.startsWith("ml-dsa-") : algo.id === algoFilter;
      return algo.level > 0 && matches;
    });
    if (!selectedAlgorithms.length) throw new Error(`Unknown or empty algorithm filter: ${algoFilter}`);
    const rows = getFullMatrix(selectedDevices, selectedAlgorithms);
    if (opt.export === "pdf") {
      const exportRows = rows.map(({ device, cells }) => ({ device, cells: cells.map((result) => ({ algorithm: result.algorithm, verdict: result.mwcVerdict, reasons: result.mwcReasons })) }));
      const output = opt.out || "states-dashboard.pdf";
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, createCatalogPdf({ matrix: exportRows, algorithmId: selectedAlgorithms[0].id, dataVersion: DATA_VERSION, engineVersion: ENGINE_VERSION }));
      process.stdout.write(`States dashboard PDF written to ${output} (${rows.length} devices, ${selectedAlgorithms.length} algorithms).\n`);
    } else if (opt.json) json(rows);
    else {
      const columns = [{ name: "Device (RAM)", value: (row) => `${row.device.name} (${row.device.ramKB} KB)` }, ...selectedAlgorithms.map((algo) => ({ name: algo.name, value: (row) => { const result = row.cells.find((cell) => cell.algorithm.id === algo.id); return `${result.mwcVerdict}${Number.isFinite(result.estimatedTimeMs) ? ` · ${result.estimatedTimeMs.toFixed(1)} ms` : " · unsupported"}`; } }))];
      table(rows, columns);
    }
  } else if (command === "simulate") {
    const profiles = await customDevices(), deviceId = requireOption("device"), algoId = requireOption("algo");
    const result = await cachedSimulate(deviceId, algoId, profiles, !opt["no-cache"]);
    const watchdogMs = Number(opt["watchdog-ms"] || 1000), alerts = simulationAlerts(result, { watchdogMs });
    if (opt.record) {
      const history = await loadHistory(), old = previousFor(history, result.device.id, result.algorithm.id);
      const regression = regressionAlert(old?.result, result, Number(opt["regression-percent"] || 5));
      if (regression) alerts.push(regression);
      await appendHistory(result.device, result.algorithm, result, alerts);
    }
    if (opt.json) json({ ...result, alerts }); else render([result], opt.csv ? "csv" : "table");
    writeAlerts(alerts);
    exitForAlerts(alerts);
  } else if (command === "export" && ((!opt.device && !opt.algo) || opt["numbers-only"] || opt.format === "pdf")) {
    if (Boolean(opt.device) !== Boolean(opt.algo)) throw new Error("Use both --device and --algo for scenario export, or omit both for the operation-level dataset.");
    const format = opt.format || (opt["numbers-only"] ? "pdf" : "csv"), rawRows = getOperationLevelData([...devices, ...await customDevices()]);
    if (opt["numbers-only"] && (opt.device || opt.algo)) throw new Error("Numbers-only PDF export covers the full operation-level dataset; omit --device and --algo.");
    let output;
    if (format === "csv" && !opt["numbers-only"]) output = operationDataToCsv(rawRows);
    else if (format === "json" && !opt["numbers-only"]) output = `${JSON.stringify(rawRows, null, 2)}\n`;
    else if (format === "pdf" && opt["numbers-only"]) {
      if (!opt.out) throw new Error("Numbers-only PDF export requires --out FILE.");
      const bytes = createNumbersOnlyPdf(rawRows, { dataVersion: DATA_VERSION, engineVersion: ENGINE_VERSION });
      await mkdir(dirname(opt.out), { recursive: true }); await writeFile(opt.out, bytes);
      process.stdout.write(`Numbers-only data PDF written to ${opt.out} (${rawRows.length} rows).\n`);
    } else throw new Error("Raw export formats are csv, json, or pdf with --numbers-only.");
    if (output !== undefined) {
      if (opt.out) { await mkdir(dirname(opt.out), { recursive: true }); await writeFile(opt.out, output); }
      else process.stdout.write(output);
    }
  } else if (command === "compare" || command === "export") {
    const deviceIds = requireOption("device").split(","), algoIds = requireOption("algo").split(",");
    const pairs = deviceIds.length === 1 ? algoIds.map((algo) => ({ device: deviceIds[0], algo })) : algoIds.length === 1 ? deviceIds.map((device) => ({ device, algo: algoIds[0] })) : deviceIds.map((device, i) => ({ device, algo: algoIds[i] }));
    if (deviceIds.length > 1 && algoIds.length > 1 && deviceIds.length !== algoIds.length) throw new Error("Use one algorithm for multiple devices, one device for multiple algorithms, or equal-length lists.");
    const profiles = await customDevices(), results = [], combinedAlerts = [];
    for (const pair of pairs) {
      const result = await cachedSimulate(pair.device, pair.algo, profiles, !opt["no-cache"]);
      const alerts = simulationAlerts(result, { watchdogMs: Number(opt["watchdog-ms"] || 1000) });
      if (opt.record) {
        const history = await loadHistory(), old = previousFor(history, result.device.id, result.algorithm.id);
        const regression = regressionAlert(old?.result, result, Number(opt["regression-percent"] || 5));
        if (regression) alerts.push(regression);
        await appendHistory(result.device, result.algorithm, result, alerts);
      }
      results.push({ ...result, alerts }); combinedAlerts.push(...alerts.map((alert) => ({ ...alert, deviceId: result.device.id, algoId: result.algorithm.id })));
    }
    const format = command === "export" ? requireOption("format") : opt.json ? "json" : opt.csv ? "csv" : "table";
    let output;
    if (format === "json") output = `${JSON.stringify(results, null, 2)}\n`;
    else if (format === "csv") output = `${columns.map((c) => quote(c.name)).join(",")}\n${results.map((r) => columns.map((c) => quote(c.value(r))).join(",")).join("\n")}\n`;
    else if (format === "table" && command === "compare") render(results);
    else throw new Error("Format must be table, json, or csv.");
    if (output !== undefined) {
      if (opt.out) { await mkdir(dirname(opt.out), { recursive: true }); await writeFile(opt.out, output); }
      else process.stdout.write(output);
    }
    writeAlerts(combinedAlerts);
    await notifyWebhook(opt.webhook, combinedAlerts, results);
    exitForAlerts(combinedAlerts);
  } else if (command === "network") {
    const algo = getAlgorithm(requireOption("algo")); if (!algo) throw new Error(`Unknown algorithm: ${opt.algo}`);
    const payloadBytes = opt.payload ?? algo.payloadBytes;
    if (payloadBytes == null) throw new Error("This algorithm has no supplied payload-size anchor. Add --payload BYTES.");
    const result = modelNetwork({ payloadBytes, link: opt.link || "802.15.4", hops: opt.hops || 1, lossRate: opt.loss || 0, loraPayloadBytes: opt["lora-payload"] || undefined }, { cache: !opt["no-cache"] });
    const alerts = networkAlerts(result);
    json({ ...result, alerts }); writeAlerts(alerts); exitForAlerts(alerts);
  } else if (command === "history") {
    const records = await loadHistory();
    const filtered = records.filter((entry) => (!opt.device || entry.deviceId === opt.device) && (!opt.algo || entry.algoId === opt.algo));
    table(filtered, [{ name: "Timestamp", value: (r) => r.timestamp }, { name: "Device", value: (r) => r.deviceId }, { name: "Algorithm", value: (r) => r.algoId }, { name: "Mean ms", value: (r) => r.result.estimatedTimeMs ?? "Not available" }, { name: "Tier", value: (r) => r.result.confidenceTier }]);
  } else if (command === "references") {
    const referenceFile = fileURLToPath(new URL("../08-REFERENCES.md", import.meta.url));
    process.stdout.write(await readFile(referenceFile, "utf8"));
  } else if (command === "report") {
    if (opt.format && opt.format !== "md") throw new Error("Only --format md is supported.");
    process.stdout.write(`${report}\n---\n${formatVersion()}\n`);
  } else throw new Error(`Unknown command: ${command}. Run 'pqc-iot-sim help'.`);
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 2;
}
