import { algorithms, classifyDevice, DATA_VERSION, devices, ENGINE_VERSION, getMeasuredResult, importMeasuredResult, listMeasuredResults, makeCustomDevice, modelNetwork, simulate, validateMeasuredResult } from "../core/index.js";
import { networkAlerts, simulationAlerts } from "../core/alerts.js";
import { createCatalogPdf, generateDeviceCatalog, generateStateMatrix, getFullMatrix } from "../core/deviceCatalog.js";
import { documentMap, projectSources, researchTools, sourceCrosswalk, standards, technologies, worksCited } from "../benchmark-data/references.js";
import { createNumbersOnlyPdf, getOperationLevelData, operationDataToCsv } from "../core/dataExport.js";
import { MWC_THRESHOLDS } from "../core/mwcRules.js";
import { wokwiBoards } from "../benchmark-data/wokwi.js";
import { getWokwiResult, importWokwiResult, listWokwiResults, parseWokwiSerial } from "../core/wokwi.js";

const $ = (q) => document.querySelector(q);
const $$ = (q) => [...document.querySelectorAll(q)];
const customKey = "pqc-iot-sim.custom-devices.v1";
const measuredKey = "pqc-iot-sim.measured-live.v1";
const wokwiKey = "pqc-iot-sim.wokwi-illustrative.v1";
const realtimeBridgeUrl = "http://127.0.0.1:8787";
let realtimeEvents = [];
let realtimeSessionId = null;
let realtimeEventSource = null;
let customs = loadCustoms();
loadMeasuredResults();
loadWokwiResults();
let compareResults = [];
let pairState = [{ device: "rp2040", algo: "ml-kem-512" }, { device: "stm32f4-disco", algo: "ml-kem-512" }];
let latestResult = null;
let editingDeviceId = null;
let pendingAddNode = null;
let pgNodeIds = { a: "rp2040", relay: "stm32f4-disco", b: "nucleo-l476rg" };
let pgRunId = 0;
const pgTimers = new Map();

function loadCustoms() { try { const value = JSON.parse(localStorage.getItem(customKey) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }
function saveCustoms() { try { localStorage.setItem(customKey, JSON.stringify(customs)); } catch { toast("Browser storage is unavailable; this profile will not persist after reload."); } }
function loadMeasuredResults() {
  try {
    const results = JSON.parse(localStorage.getItem(measuredKey) || "[]");
    if (Array.isArray(results)) for (const result of results) importMeasuredResult(result);
  } catch { try { localStorage.removeItem(measuredKey); } catch {} }
}
function saveMeasuredResults() { localStorage.setItem(measuredKey, JSON.stringify(listMeasuredResults())); }
function loadWokwiResults() { try { const saved = JSON.parse(localStorage.getItem(wokwiKey) || "[]"); if (Array.isArray(saved)) saved.forEach(importWokwiResult); } catch { try { localStorage.removeItem(wokwiKey); } catch {} } }
function saveWokwiResults() { localStorage.setItem(wokwiKey, JSON.stringify(listWokwiResults())); }
function esc(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function allDevices() { return [...devices, ...customs]; }
function toast(message) { const node = $("#toast"); node.textContent = message; node.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove("show"), 2700); }
function selectOptions(items, selected, label) { return `<option value="" disabled>${label}</option>` + items.map((item) => `<option value="${esc(item.id)}" ${item.id === selected ? "selected" : ""}>${esc(item.name)}</option>`).join(""); }
function format(value, suffix = "", digits = 1) { return Number.isFinite(value) ? `${Number(value.toFixed(digits)).toLocaleString()}${suffix}` : "Not available"; }
function tierFormat(result, value, suffix = "", digits = 1, subTier = null) { return Number.isFinite(value) ? `${(subTier || result.confidenceTier) === "literature-exact" ? "" : "~"}${format(value, suffix, digits)}` : "Not available"; }
function status(verdict) { return `<span class="status ${verdict}">${esc(verdict)}</span>`; }

function populateSelectors() {
  const ds = allDevices();
  const simDevice = $("#sim-device").value || "rp2040";
  const simAlgo = $("#sim-algo").value || "ml-kem-512";
  $("#sim-device").innerHTML = ds.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}${d.isReference === false ? " · custom" : ""}</option>`).join("");
  $("#sim-device").value = ds.some((d) => d.id === simDevice) ? simDevice : ds[0].id;
  $("#sim-algo").innerHTML = algorithms.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}${Number.isFinite(a.timeMs) ? "" : " · timing unavailable"}</option>`).join("");
  $("#sim-algo").value = algorithms.some((a) => a.id === simAlgo) ? simAlgo : algorithms[0].id;
  $("#net-algo").innerHTML = `<option value="">Manual payload</option>` + algorithms.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}${a.payloadBytes ? ` · ${a.payloadBytes.toLocaleString()} B` : " · size unavailable"}</option>`).join("");
  const pgAlgo = $("#pg-algo").value || "ml-kem-512";
  $("#pg-algo").innerHTML = algorithms.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}${Number.isFinite(a.timeMs) ? "" : " · timing unavailable"}</option>`).join("");
  $("#pg-algo").value = algorithms.some((a) => a.id === pgAlgo) ? pgAlgo : "ml-kem-512";
  renderPairs();
  renderPlaygroundNodes();
}

function renderOverview() {
  $("#overview-devices").innerHTML = devices.filter((d) => d.isReference).slice(0, 4).map((d) => `<div class="device-card"><div class="device-head"><b>${esc(d.name)}</b><span class="pill">${esc(d.cpu.toUpperCase())}</span></div><div class="device-meta">${d.ramKB} KB RAM · ${d.flashKB.toLocaleString()} KB flash · ${d.clockMHz ? `${d.clockMHz} MHz` : "clock unspecified"}</div></div>`).join("");
}
function renderDeviceTable() {
  $("#device-table").innerHTML = allDevices().map((d) => { const catalog = devices.some((ref) => ref.id === d.id); return `<tr><td><b>${esc(d.name)}</b><br><span class="tagline">${esc(d.id)}</span></td><td>${esc(d.cpu)}</td><td>${d.ramKB.toLocaleString()} KB</td><td>${d.flashKB.toLocaleString()} KB</td><td>${d.clockMHz ? `${d.clockMHz} MHz` : "Unspecified"}</td><td>${esc(d.source || "User-defined profile")}</td><td><span class="pill ${!d.isReference ? "custom" : ""}">${d.isReference ? "REFERENCE" : catalog ? "CATALOG" : "CUSTOM"}</span></td><td>${!d.isReference && !catalog ? `<button class="btn" data-edit-device="${esc(d.id)}" aria-label="Edit ${esc(d.name)}">Edit</button> <button class="btn" data-delete-device="${esc(d.id)}" aria-label="Delete ${esc(d.name)}">Delete</button>` : ""}</td></tr>`; }).join("");
  $("#report-devices").innerHTML = allDevices().map((d) => `<tr><td>${esc(d.name)}</td><td>${esc(d.cpu)}</td><td>${d.ramKB} KB</td><td>${d.flashKB.toLocaleString()} KB</td><td>${d.clockMHz ? `${d.clockMHz} MHz` : "Not specified"}</td></tr>`).join("");
}

function renderReferences() {
  $("#reference-project-sources").innerHTML = projectSources.map((item) => `<tr><td>${esc(item.name)}</td><td>${esc(item.role)}</td><td>${esc(item.availability)}</td></tr>`).join("");
  $("#reference-standards").innerHTML = standards.map((item) => `<tr><td><b>${esc(item.id)}</b></td><td>${esc(item.name)}</td><td>${esc(item.role)}</td></tr>`).join("");
  $("#reference-tools").innerHTML = researchTools.map((item) => `<tr><td><b>${esc(item.name)}</b></td><td>${esc(item.role)}</td><td>${esc(item.integration)}</td></tr>`).join("");
  $("#reference-works").innerHTML = worksCited.map((item) => `<tr><td>${esc(item.numbers)}</td><td>${esc(item.title)}</td><td>${esc(item.venue)}</td></tr>`).join("");
  $("#reference-crosswalk").innerHTML = sourceCrosswalk.map((item) => `<tr><td>${esc(item.field)}</td><td>${esc(item.entries)}</td><td>${esc(item.references)}</td><td>${esc(item.note)}</td></tr>`).join("");
  $("#reference-technologies").innerHTML = technologies.map((item) => `<tr><td><b>${esc(item.name)}</b></td><td>${esc(item.usage)}</td><td>${esc(item.status)}</td></tr>`).join("");
  $("#reference-documents").innerHTML = documentMap.map(([file, description]) => `<tr><td><a href="../${esc(file)}">${esc(file)}</a></td><td>${esc(description)}</td></tr>`).join("");
}

function renderMatrix() {
  const matrix = generateStateMatrix(customs);
  const labels = ["ML-KEM-512", "ML-DSA-44", "ML-DSA-87"];
  $("#matrix-table").innerHTML = `<table class="data-table"><thead><tr><th>Device (RAM)</th>${labels.map((label) => `<th>${label}</th>`).join("")}</tr></thead><tbody>${matrix.map(({ device, cells }) => `<tr><td>${esc(device.id)} (${device.ramKB} KB)</td>${cells.map((cell) => `<td><span class="status ${cell.verdict}" title="${esc(cell.reasons.join(" "))}">${cell.verdict}</span></td>`).join("")}</tr>`).join("")}</tbody></table>`;
  $("#matrix-version").textContent = `${matrix.length} devices · ${algorithms.length} algorithms available per device · Data ${DATA_VERSION} · Engine ${ENGINE_VERSION}`;
}

function downloadMatrixPdf() {
  const bytes = createCatalogPdf({ matrix: generateStateMatrix(customs), algorithmId: $("#matrix-algo").value, metric: $("#matrix-metric").value, dataVersion: DATA_VERSION, engineVersion: ENGINE_VERSION });
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const link = document.createElement("a"); link.href = url; link.download = "pqc-iot-device-matrix.pdf"; link.click(); URL.revokeObjectURL(url);
}

const dashboardAlgorithms = algorithms.filter((algo) => algo.level > 0);
const chartColors = ["#3478e5", "#41a77b", "#945fe0", "#e39a36", "#d45c62", "#29a3ad", "#7a8797", "#c05b9a", "#6378c6", "#8b9a35"];
function statesSelectedAlgorithms() {
  const filter = $("#states-algo-filter").value;
  if (filter === "all") return dashboardAlgorithms;
  if (filter === "kem") return dashboardAlgorithms.filter((algo) => algo.id.startsWith("ml-kem-"));
  if (filter === "signature") return dashboardAlgorithms.filter((algo) => algo.family === "signature");
  return dashboardAlgorithms.filter((algo) => algo.id === filter);
}
function statesSelectedDevices() {
  return allDevices().filter((device) => {
    const catalog = devices.some((item) => item.id === device.id);
    return device.isReference ? $("#states-reference").checked : catalog ? $("#states-catalog").checked : $("#states-custom").checked;
  });
}
function stateCellMarkup(result) {
  const time = Number.isFinite(result.estimatedTimeMs) ? `${result.confidenceTier === "literature-exact" ? "" : "~"}${format(result.estimatedTimeMs, " ms", 1)}` : "time unavailable";
  const live = getMeasuredResult(result.device.id, result.algorithm.id);
  const simulated = getWokwiResult(result.device.id, result.algorithm.id);
  return `<button class="state-cell ${result.mwcVerdict}" data-state-device="${esc(result.device.id)}" data-state-algo="${esc(result.algorithm.id)}" title="${esc(result.mwcReasons.join(" "))}">${esc(result.mwcVerdict)}${live ? `<small>LIVE · ${format(live.measurement.meanMs, " ms", 1)}</small>` : simulated ? `<small>SIM · ${format(simulated.elapsedMs, " ms", 3)}</small>` : `<small>${esc(time)}</small>`}</button>`;
}
function renderStateMatrix(matrix, algoList) {
  $("#states-matrix").innerHTML = matrix.length ? `<table class="data-table"><thead><tr><th>Device (RAM)</th>${algoList.map((algo) => `<th>${esc(algo.name)}</th>`).join("")}</tr></thead><tbody>${matrix.map(({ device, cells }) => `<tr><td><b>${esc(device.name)}</b><br><span class="tagline">${device.ramKB} KB · ${esc(device.id)}</span></td>${cells.map(stateCellMarkup).map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>` : `<div class="notice info">No devices match these filters.</div>`;
}
function svgFrame(height, body, width = 820) { return `<svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 ${width} ${Math.max(height, 70)}" width="${width}" height="${Math.max(height, 70)}"><rect width="100%" height="100%" fill="white"/>${body}</svg>`; }
function renderStateBars(matrix, algoList, metric, { logScale = false, includeClassical = false } = {}) {
  const source = includeClassical ? [...algoList, ...algorithms.filter((algo) => algo.level === 0)] : algoList;
  const rows = matrix.flatMap(({ device }) => source.map((algorithm) => ({ device, result: simulate(device, algorithm, customs), algorithm })));
  const field = metric === "energy" ? "estimatedEnergyMJ" : "estimatedTimeMs";
  const values = rows.filter((row) => Number.isFinite(row.result[field]));
  if (!values.length) return `<div class="notice info">No numeric ${metric} anchors for this selection.</div>`;
  const max = Math.max(...values.map((row) => row.result[field]));
  const height = values.length * 23 + 36;
  const body = values.map(({ device, result, algorithm }, index) => {
    const y = 22 + index * 23, value = result[field], ratio = logScale && metric === "time" ? Math.log1p(value) / Math.log1p(max) : value / max;
    const width = Math.max(1, ratio * 480), color = algorithm.level === 0 ? "#8994a3" : chartColors[algorithms.indexOf(algorithm) % chartColors.length];
    return `<g class="state-tooltip" data-state-device="${esc(device.id)}" data-state-algo="${esc(algorithm.id)}"><text x="4" y="${y + 11}" font-size="10" fill="#344357">${esc(`${device.name} · ${algorithm.name}`.slice(0, 38))}</text><rect x="285" y="${y}" width="${width}" height="14" rx="4" fill="${color}"/><text x="${292 + width}" y="${y + 11}" font-size="9" fill="#344357">${value.toFixed(1)} ${metric === "energy" ? "mJ" : "ms"}</text></g>`;
  }).join("");
  return svgFrame(height, body);
}
function renderRamChart(matrix, algoList) {
  const items = matrix.map(({ device }) => device), max = Math.max(128, ...items.map((device) => device.ramKB)), x0 = 185, width = 590;
  const body = `<line x1="${x0 + 64 / max * width}" y1="8" x2="${x0 + 64 / max * width}" y2="${items.length * 30 + 18}" stroke="#d59b2f" stroke-dasharray="4 3"/><line x1="${x0 + 128 / max * width}" y1="8" x2="${x0 + 128 / max * width}" y2="${items.length * 30 + 18}" stroke="#398c68" stroke-dasharray="4 3"/>${items.map((device, i) => { const y = 22 + i * 30, bar = device.ramKB / max * width, algo = algoList[0]?.id || "ml-kem-512"; return `<g class="state-tooltip" data-state-device="${esc(device.id)}" data-state-algo="${esc(algo)}"><text x="4" y="${y + 10}" font-size="10" fill="#344357">${esc(`${device.name} (${device.ramKB} KB)`)}</text><rect x="${x0}" y="${y}" width="${bar}" height="14" rx="4" fill="#48a77b"/></g>`; }).join("")}<text x="${x0 + 64 / max * width + 2}" y="12" font-size="9" fill="#946616">64 KB</text><text x="${x0 + 128 / max * width + 2}" y="12" font-size="9" fill="#287852">128 KB</text>`;
  return svgFrame(items.length * 30 + 28, body, 820);
}
function renderNetworkChart(matrix, algoList) {
  const algorithm = [...algoList].sort((a, b) => (b.payloadBytes || 0) - (a.payloadBytes || 0))[0];
  if (!algorithm?.payloadBytes) return `<div class="notice info">Payload size is unavailable for the selected algorithms.</div>`;
  const rows = matrix.flatMap(({ device }) => [
    { device, link: "802.15.4", result: modelNetwork({ payloadBytes: algorithm.payloadBytes, link: "802.15.4", hops: 1 }) },
    { device, link: "lora", result: modelNetwork({ payloadBytes: algorithm.payloadBytes, link: "lora", hops: 1 }) }
  ]), max = Math.max(1, ...rows.map((row) => row.result.fragmentCount));
  const body = rows.map(({ device, link, result }, i) => { const y = 20 + i * 20, width = result.fragmentCount / max * 480, color = link === "lora" ? "#45a77c" : "#3478e5"; return `<g class="state-tooltip" data-state-device="${esc(device.id)}" data-state-algo="${esc(algorithm.id)}"><text x="4" y="${y + 10}" font-size="9" fill="#344357">${esc(`${device.name} · ${link}`.slice(0, 38))}</text><rect x="285" y="${y}" width="${width}" height="13" rx="4" fill="${color}"/><text x="${292 + width}" y="${y + 10}" font-size="9" fill="#344357">${result.fragmentCount}</text></g>`; }).join("");
  return svgFrame(rows.length * 20 + 30, body);
}
function renderVarianceChart(matrix, algoList) {
  const signatures = algoList.filter((algo) => algo.family === "signature");
  if (!signatures.length) return "";
  const rows = matrix.flatMap(({ device, cells }) => cells.filter((result) => result.algorithm.family === "signature").map((result) => ({ device, result })));
  const max = Math.max(1, ...rows.flatMap(({ result }) => [result.estimatedP99Ms, result.estimatedTimeMs]).filter(Number.isFinite));
  const body = rows.map(({ device, result }, i) => { const y = 22 + i * 28, base = 290, scale = 470 / max, p50 = result.estimatedP50Ms, p95 = result.estimatedP95Ms, p99 = result.estimatedP99Ms, mean = result.estimatedTimeMs; return `<g class="state-tooltip" data-state-device="${esc(device.id)}" data-state-algo="${esc(result.algorithm.id)}"><text x="4" y="${y + 10}" font-size="9" fill="#344357">${esc(`${device.name} · ${result.algorithm.name}`.slice(0, 37))}</text>${Number.isFinite(p50) ? `<line x1="${base + p50 * scale}" y1="${y + 7}" x2="${base + (p99 || p95 || p50) * scale}" y2="${y + 7}" stroke="#b5c4d3" stroke-width="4"/>` : ""}${Number.isFinite(p95) ? `<line x1="${base}" y1="${y + 13}" x2="${base + p95 * scale}" y2="${y + 13}" stroke="#e3a345" stroke-width="3"/>` : ""}${Number.isFinite(mean) ? `<circle cx="${base + mean * scale}" cy="${y + 7}" r="4" fill="#3478e5"/>` : ""}<text x="${base + 480}" y="${y + 11}" font-size="8" fill="#53647a">CV ${result.cvPercent ?? "—"}% · p99 ${p99 ?? "—"} ms</text></g>`; }).join("");
  return svgFrame(rows.length * 28 + 30, body, 850);
}
function renderStateDetail(deviceId, algoId) {
  const device = allDevices().find((item) => item.id === deviceId), algorithm = algorithms.find((item) => item.id === algoId);
  if (!device || !algorithm) return;
  const result = simulate(device, algorithm, customs), alerts = simulationAlerts(result);
  const alertMarkup = alerts.map((alert) => `<div class="notice ${alert.severity === "critical" || alert.severity === "warning" ? "warn" : "info"} state-alert">${esc(alert.severity.toUpperCase())}: ${esc(alert.message)}</div>`).join("");
  $("#states-detail").innerHTML = `<div class="section-row"><div><h2>${esc(device.name)} · ${esc(algorithm.name)}</h2><p>${esc(result.confidenceTier)} — ${esc(result.confidenceReason)}</p></div><button class="btn" data-state-playground="${esc(device.id)}" data-state-playground-algo="${esc(algorithm.id)}">View in Playground →</button></div><div class="state-detail-grid"><div><b>Device</b>${esc(device.cpu)} · ${device.ramKB} KB RAM · ${device.flashKB} KB flash · ${device.clockMHz ?? "clock unspecified"} MHz<br>${esc(device.source || "User-defined profile")}</div><div><b>Algorithm</b>${esc(algorithm.family)} · level ${algorithm.level} · ${algorithm.payloadBytes ?? "—"} B payload</div><div><b>MWC state</b>${status(result.mwcVerdict)} — ${esc(result.mwcReasons.join(" "))}</div><div><b>Time / confidence</b>${format(result.estimatedTimeMs, " ms", 1)} · ${esc(result.confidenceTier)}</div><div><b>Stack / firmware flash</b>${format(result.estimatedStackKB, " KB")} / ${format(result.estimatedFlashKB, " KB")} · ${esc(result.flashFootprintReason)}</div><div><b>Energy / algorithm source</b>${format(result.estimatedEnergyMJ, " mJ", 2)} · ${esc(algorithm.source)}</div></div>${Number.isFinite(result.estimatedP95Ms) || Number.isFinite(result.estimatedP99Ms) ? `<div class="notice info">Mean ${format(result.estimatedTimeMs, " ms")} · CV ${result.cvPercent ?? "—"}% · p50 ${format(result.estimatedP50Ms, " ms")} · p95 ${format(result.estimatedP95Ms, " ms")} · p99 ${format(result.estimatedP99Ms, " ms")}</div>` : ""}${alertMarkup}`;
}
function renderStatesDashboard() {
  const algoList = statesSelectedAlgorithms(), selected = statesSelectedDevices();
  const matrix = getFullMatrix(selected, algoList);
  const counts = { reliable: 0, marginal: 0, infeasible: 0, unknown: 0, "not-applicable": 0 };
  for (const { cells } of matrix) for (const cell of cells) counts[cell.mwcVerdict] = (counts[cell.mwcVerdict] || 0) + 1;
  $("#states-summary").innerHTML = Object.entries(counts).map(([state, count]) => `<div class="states-count ${state}"><b>${count}</b>${state[0].toUpperCase()}${state.slice(1)} cells</div>`).join("");
  renderStateMatrix(matrix, algoList);
  const classical = $("#states-classical").checked, logarithmic = $("#states-log").checked;
  $("#states-time-chart").innerHTML = renderStateBars(matrix, algoList, "time", { logScale: logarithmic, includeClassical: classical });
  $("#states-ram-chart").innerHTML = renderRamChart(matrix, algoList);
  $("#states-energy-chart").innerHTML = renderStateBars(matrix, algoList, "energy", { includeClassical: classical });
  $("#states-network-chart").innerHTML = renderNetworkChart(matrix, algoList);
  const hasSignature = algoList.some((algo) => algo.family === "signature");
  $("#states-variance-card").hidden = !hasSignature;
  if (hasSignature) $("#states-variance-chart").innerHTML = renderVarianceChart(matrix, algoList);
  return { matrix, algoList };
}
function downloadStatesPdf() {
  const { matrix, algoList } = renderStatesDashboard();
  const exportMatrix = matrix.map(({ device, cells }) => ({ device, cells: cells.map((result) => ({ algorithm: result.algorithm, verdict: result.mwcVerdict, reasons: result.mwcReasons })) }));
  const selectedAlgo = algoList[0]?.id || "ml-kem-512";
  const bytes = createCatalogPdf({ matrix: exportMatrix, algorithmId: selectedAlgo, dataVersion: DATA_VERSION, engineVersion: ENGINE_VERSION });
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })); const link = document.createElement("a"); link.href = url; link.download = "pqc-iot-states-dashboard.pdf"; link.click(); URL.revokeObjectURL(url);
}
function downloadOperationData(format) {
  const rows = getOperationLevelData(allDevices());
  const body = format === "csv" ? operationDataToCsv(rows) : JSON.stringify(rows, null, 2);
  const blob = new Blob([body], { type: format === "csv" ? "text/csv;charset=utf-8" : "application/json" });
  const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = `pqc-iot-data.${format}`; link.click(); URL.revokeObjectURL(url);
}
function downloadNumbersOnlyPdf() {
  const rows = getOperationLevelData(allDevices());
  const bytes = createNumbersOnlyPdf(rows, { dataVersion: DATA_VERSION, engineVersion: ENGINE_VERSION });
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), link = document.createElement("a"); link.href = url; link.download = "pqc-iot-data.pdf"; link.click(); URL.revokeObjectURL(url);
}
function downloadChartPng(containerId) {
  const svg = $(`#${containerId} svg`); if (!svg) return toast("This chart has no drawable data.");
  const source = new XMLSerializer().serializeToString(svg), blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" }), url = URL.createObjectURL(blob), image = new Image();
  image.onload = () => { const canvas = document.createElement("canvas"), box = svg.viewBox.baseVal; canvas.width = box.width; canvas.height = box.height; canvas.getContext("2d").drawImage(image, 0, 0); URL.revokeObjectURL(url); const link = document.createElement("a"); link.href = canvas.toDataURL("image/png"); link.download = `${containerId}.png`; link.click(); };
  image.onerror = () => { URL.revokeObjectURL(url); toast("Could not render this chart as PNG."); }; image.src = url;
}

function pgOverall(a, b, relay) {
  const scores = [a, b, ...(relay ? [relay] : [])].map((x) => x.verdict);
  return scores.includes("infeasible") ? "infeasible" : scores.includes("marginal") ? "marginal" : "reliable";
}
function pgSelectedDevice(key) { return allDevices().find((d) => d.id === pgNodeIds[key]) || allDevices()[0]; }
function pgSelectedAlgo() { return algorithms.find((a) => a.id === $("#pg-algo").value) || algorithms[0]; }
function pgNodeAssessment(key, algo, forwarding = false) {
  const device = pgSelectedDevice(key);
  return { device, ...classifyDevice(device, forwarding ? [] : [algo]) };
}
function renderPlaygroundNodes() {
  const route = $("#pg-route");
  if (!route) return;
  const algo = pgSelectedAlgo(), relayOn = $("#pg-relay-toggle").checked;
  for (const key of ["a", "relay", "b"]) {
    const select = $(`#pg-device-${key}`), device = pgSelectedDevice(key), forwarding = key === "relay";
    select.innerHTML = allDevices().map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join("") + `<option value="__add_custom__">＋ Add custom device…</option>`;
    select.value = device.id;
    const assessment = pgNodeAssessment(key, algo, forwarding);
    $(`#pg-name-${key}`).textContent = device.name;
    $(`#pg-spec-${key}`).textContent = `${device.cpu} · ${device.ramKB} KB RAM · ${device.flashKB.toLocaleString()} KB flash · ${device.clockMHz ? `${device.clockMHz} MHz` : "clock unspecified"}`;
    const badge = $(`#pg-verdict-${key}`); badge.textContent = assessment.verdict; badge.className = `pg-verdict ${assessment.verdict}`; badge.title = assessment.reasons.join(" ");
    const card = $(`#pg-node-${key}`); card.classList.remove("reliable", "marginal", "infeasible"); card.classList.add(assessment.verdict);
    $(`#pg-state-${key}`).textContent = `MWC · ${assessment.verdict}`;
  }
  route.classList.toggle("relay-on", relayOn);
  $("#pg-link-2").style.display = relayOn ? "flex" : "none";
  $("#pg-link-1").classList.toggle("type-lora", $("#pg-link-type").value === "lora");
  $("#pg-link-2").classList.toggle("type-lora", $("#pg-link-type").value === "lora");
  const hopCount = Math.max(1, Number($("#pg-hops").value) || 1);
  const link = $("#pg-link-type").value;
  const frameSize = link === "802.15.4" ? (hopCount > 1 ? 45 : 81) : Number($("#pg-lora-size")?.value || 51);
  const label = `${link === "802.15.4" ? "802.15.4" : "LoRa"} · ${frameSize} B/frame`;
  $("#pg-link-label-1").textContent = label;
  $("#pg-link-label-2").textContent = label;
  const a = pgNodeAssessment("a", algo), b = pgNodeAssessment("b", algo), relay = relayOn ? pgNodeAssessment("relay", algo, true) : null;
  const verdict = pgOverall(a, b, relay);
  $("#pg-run").textContent = verdict === "infeasible" ? "Why is this infeasible?" : "▶ Run exchange";
  route.classList.remove("reliable", "marginal", "infeasible", "running"); route.classList.add(verdict);
  const relayDevice = pgSelectedDevice("relay"), buffer = $("#pg-buffer");
  buffer.textContent = relayDevice.ramKB < 64 ? `VRB buffer risk · ${relayDevice.ramKB} KB RAM` : `VRB buffer · ${relayDevice.ramKB} KB RAM`;
  buffer.classList.toggle("risk", relayDevice.ramKB < 64);
}

function cancelPlayground(message = "Configuration changed. Run again to animate the exchange.") {
  pgRunId++;
  for (const [timer, resolve] of pgTimers) { clearTimeout(timer); resolve(); }
  pgTimers.clear();
  $$(".pg-node").forEach((node) => node.classList.remove("running", "shake", "signing"));
  $$(".pg-node").forEach((node) => node.getAnimations().forEach((animation) => animation.cancel()));
  $$(".pg-packets").forEach((lane) => lane.replaceChildren());
  $("#pg-route").classList.remove("running");
  const pulseRow = $("#pg-pulse-row"); pulseRow.replaceChildren(); pulseRow.hidden = true; delete pulseRow.dataset.pulseCount;
  ["a", "relay", "b"].forEach((key) => { const state = $(`#pg-state-${key}`); if (state) state.classList.remove("pg-state-running"); });
  renderPlaygroundNodes();
  $("#pg-result").innerHTML = `<div class="pg-result-mark">◇</div><div><b>Ready to exchange</b><p>${esc(message)}</p></div>`;
}

function pgDisplayDuration(timeMs) {
  const value = Number.isFinite(timeMs) ? 200 * Math.log10(timeMs + 10) : 800;
  return Math.max(300, Math.min(2500, value));
}
function pgPulseCount(algo) {
  if (algo.id === "ml-dsa-44") return Math.round(algo.expectedRejectionIterations ?? 4);
  if (algo.id === "ml-dsa-65") return Math.round(algo.expectedRejectionIterations ?? 5);
  if (algo.id === "ml-dsa-87") return 5; // visual distinction only; no iteration anchor was supplied
  return algo.family === "signature" ? 1 : 0;
}
function pgResultMarkup(resultA, resultB, networkResult, algo, relayAssessment = null) {
  const alerts = [...simulationAlerts(resultA), ...simulationAlerts(resultB), ...(networkResult ? networkAlerts(networkResult) : [])];
  const visibleAlerts = alerts.filter((alert) => alert.severity !== "info");
  const metrics = [
    ["Mean A / B", `${tierFormat(resultA, resultA.estimatedTimeMs, " ms")} / ${tierFormat(resultB, resultB.estimatedTimeMs, " ms")}`],
    ["Stack A / B", `${format(resultA.estimatedStackKB, " KB")} / ${format(resultB.estimatedStackKB, " KB")}`],
    ["Energy A / B", `${tierFormat(resultA, resultA.estimatedEnergyMJ, " mJ", 2)} / ${tierFormat(resultB, resultB.estimatedEnergyMJ, " mJ", 2)}`],
    ["Network", networkResult ? `${networkResult.fragmentCount} frame${networkResult.fragmentCount === 1 ? "" : "s"} · ${format(networkResult.successProbability * 100, "%", 1)} success` : "Payload size unavailable"]
  ];
  const lowerRam = [resultA, resultB].find((r) => r.estimatedStackKB != null && r.device.ramKB < r.estimatedStackKB * MWC_THRESHOLDS.stackHeadroomRatio);
  const reason = lowerRam ? `${algo.name} estimated stack (${format(lowerRam.estimatedStackKB, " KB")}) leaves less than 20% headroom in ${lowerRam.device.name} RAM (${lowerRam.device.ramKB} KB).` : relayAssessment?.verdict === "infeasible" ? `Relay ${relayAssessment.device.name} is infeasible: ${relayAssessment.reasons.join(" ")}` : [...resultA.mwcReasons, ...resultB.mwcReasons].join(" ");
  const relayLabel = relayAssessment ? ` · relay ${esc(relayAssessment.verdict)}` : "";
  return `<div class="pg-result-mark">${networkResult && networkResult.fragmentCount > 1 ? "▦" : "◇"}</div><div><b>${esc(algo.name)} exchange · ${resultA.mwcVerdict === "reliable" && resultB.mwcVerdict === "reliable" ? "both endpoints reliable" : `${esc(resultA.mwcVerdict)} / ${esc(resultB.mwcVerdict)}`}${relayLabel}</b><p title="${esc(resultA.confidenceReason)}">${esc(reason || "Projection complete.")} · Confidence: ${esc(resultA.confidenceTier)} / ${esc(resultB.confidenceTier)}</p><div class="pg-metrics">${metrics.map(([label, value]) => `<span class="pg-metric">${esc(label)} <b>${esc(value)}</b></span>`).join("")}</div>${visibleAlerts.map((alert) => `<div class="notice ${alert.severity === "critical" ? "critical" : "warn"}" role="alert">${esc(alert.message)}</div>`).join("")}</div>`;
}

function pgAddPackets(lane, count, duration, dropped = false) {
  lane.replaceChildren();
  const total = Math.max(1, count || 1);
  for (let i = 0; i < total; i++) {
    const packet = document.createElement("span"); packet.className = `pg-packet packet${total > 1 ? " fragment" : ""}`;
    packet.style.setProperty("--pg-duration", `${duration}ms`);
    packet.style.setProperty("--pg-delay", `${Math.min(i * 12, duration * .45)}ms`);
    if (dropped && i === Math.floor(total / 2)) packet.classList.add("dropped");
    lane.append(packet);
  }
}
const pgSleep = (ms) => new Promise((resolve) => {
  const timer = setTimeout(() => { pgTimers.delete(timer); resolve(); }, ms);
  pgTimers.set(timer, resolve);
});

async function runPlayground() {
  cancelPlayground("Preparing the shared model projection…");
  const runId = pgRunId, algo = pgSelectedAlgo(), relayOn = $("#pg-relay-toggle").checked;
  const deviceA = pgSelectedDevice("a"), deviceB = pgSelectedDevice("b"), relayDevice = pgSelectedDevice("relay");
  const resultA = simulate(deviceA, algo), resultB = simulate(deviceB, algo);
  const assesA = classifyDevice(deviceA, [algo]), assesB = classifyDevice(deviceB, [algo]);
  const relayAsses = relayOn ? classifyDevice(relayDevice, []) : null;
  const verdict = pgOverall(assesA, assesB, relayAsses);
  const hops = Math.max(1, Number($("#pg-hops").value) || 1);
  const lossRate = Math.max(0, Math.min(100, Number($("#pg-loss").value) || 0)) / 100;
  const networkResult = algo.payloadBytes == null ? null : modelNetwork({ payloadBytes: algo.payloadBytes, link: $("#pg-link-type").value, hops, lossRate });
  const strip = $("#pg-result");
  strip.dataset.retryShown = "false";
  strip.innerHTML = pgResultMarkup(resultA, resultB, networkResult, algo, relayAsses ? { ...relayAsses, device: relayDevice } : null);
  renderPlaygroundNodes();
  if (verdict === "infeasible") {
    $("#pg-route").classList.add("infeasible");
    ["a", ...(relayOn ? ["relay"] : []), "b"].forEach((key) => { const card = $(`#pg-node-${key}`); if (card.classList.contains("infeasible")) card.classList.add("shake"); });
    strip.querySelector("b").textContent = `${algo.name} exchange blocked · infeasible configuration`;
    return;
  }
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const totalDuration = pgDisplayDuration(resultA.estimatedTimeMs);
  const links = relayOn ? [$("#pg-link-1 .pg-packets"), $("#pg-link-2 .pg-packets")] : [$("#pg-link-1 .pg-packets")];
  const nodes = ["a", ...(relayOn ? ["relay"] : []), "b"];
  $("#pg-route").classList.add("running");
  nodes.forEach((key) => { $(`#pg-node-${key}`).classList.add("running"); $(`#pg-state-${key}`).textContent = "Running projection"; $(`#pg-state-${key}`).classList.add("pg-state-running"); });
  const signature = algo.family === "signature";
  const pulseCount = pgPulseCount(algo);
  if (signature) {
    const row = $("#pg-pulse-row"); row.hidden = false; row.dataset.pulseCount = String(pulseCount);
    row.setAttribute("aria-label", algo.expectedRejectionIterations == null ? `${pulseCount} illustrative signing pulses; rejection iteration count unavailable` : `${pulseCount} signing pulses, rounded from ${algo.expectedRejectionIterations} expected rejection iterations`);
    for (let i = 0; i < pulseCount; i++) { const pulse = document.createElement("span"); pulse.className = "pg-pulse"; pulse.dataset.pulse = String(i + 1); row.append(pulse); }
  }
  const animationDuration = reducedMotion ? 0 : totalDuration / links.length;
  if (!reducedMotion && signature) {
    const nodeA = $("#pg-node-a"), pulses = $$("#pg-pulse-row .pg-pulse");
    for (let i = 0; i < pulseCount; i++) {
      if (runId !== pgRunId) return;
      (pulses[i] || nodeA).animate([{ boxShadow: "0 0 0 0 #3474e300" }, { boxShadow: "0 0 0 9px #3474e333" }, { boxShadow: "0 0 0 0 #3474e300" }], { duration: 170, easing: "ease-in-out" });
      await pgSleep(145);
    }
  }
  if (reducedMotion) {
    strip.innerHTML = pgResultMarkup(resultA, resultB, networkResult, algo, relayAsses ? { ...relayAsses, device: relayDevice } : null);
  } else {
    for (let i = 0; i < links.length; i++) {
      if (runId !== pgRunId) return;
      const visualFragmentCount = algo.family === "signature" ? (networkResult?.fragmentCount || 1) : 1;
      const attemptFailed = Boolean(networkResult && networkResult.packetLossRate > 0 && networkResult.successProbability < 0.5);
      if (attemptFailed) strip.dataset.retryShown = "true";
      pgAddPackets(links[i], visualFragmentCount, animationDuration, attemptFailed);
      await pgSleep(animationDuration + Math.min(visualFragmentCount * 12, animationDuration * .45) + 40);
      if (runId !== pgRunId) return;
      if (attemptFailed) {
        strip.querySelector("p").textContent = `A fragment was lost; the whole datagram dropped. Retrying the ${visualFragmentCount}-fragment exchange…`;
        pgAddPackets(links[i], visualFragmentCount, Math.min(450, animationDuration), false);
        await pgSleep(Math.min(520, animationDuration + 40));
      }
      if (i < links.length - 1) links[i].replaceChildren();
    }
  }
  if (runId !== pgRunId) return;
  $("#pg-route").classList.remove("running");
  nodes.forEach((key) => { $(`#pg-node-${key}`).classList.remove("running"); $(`#pg-state-${key}`).classList.remove("pg-state-running"); $(`#pg-state-${key}`).textContent = `Complete · ${$(`#pg-verdict-${key}`).textContent}`; });
  strip.innerHTML = pgResultMarkup(resultA, resultB, networkResult, algo, relayAsses ? { ...relayAsses, device: relayDevice } : null);
  if (algo.id === "ml-dsa-87") strip.querySelector("p").textContent += " Five signing pulses distinguish this set visually; no iteration estimate was supplied.";
}

function renderPairs() {
  const devs = allDevices();
  $("#compare-pairs").innerHTML = pairState.map((pair, i) => `<div class="compare-row"><select aria-label="Scenario ${i + 1} device" data-pair-device="${i}">${devs.map((d) => `<option value="${esc(d.id)}" ${pair.device === d.id ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select><select aria-label="Scenario ${i + 1} algorithm" data-pair-algo="${i}">${algorithms.map((a) => `<option value="${esc(a.id)}" ${pair.algo === a.id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select><button class="remove" data-remove-pair="${i}" title="Remove scenario" ${pairState.length === 1 ? "disabled" : ""}>×</button></div>`).join("");
}

function renderSimulation(result) {
  latestResult = result;
  const varianceAlert = simulationAlerts(result).find((alert) => alert.rule === "tail-latency");
  const variance = result.cvPercent != null || result.estimatedP50Ms != null || result.estimatedP99Ms != null ? `<div class="section-row" style="margin-top:4px"><div><h2>Signing variance</h2><p>${esc(result.varianceModel || "Published percentile anchor")}</p></div></div><div class="variance">${result.cvPercent != null ? `<span>Coefficient of variation<b>${format(result.cvPercent, "%", 1)}</b></span>` : ""}${result.estimatedP50Ms != null ? `<span>p50 estimate<b>${tierFormat(result, result.estimatedP50Ms, " ms", 1, "interpolated")}</b></span>` : ""}${result.estimatedP95Ms != null ? `<span>p95 estimate<b>${tierFormat(result, result.estimatedP95Ms, " ms", 1, result.p95ConfidenceTier)}</b></span>` : ""}${result.estimatedP99Ms != null ? `<span>p99<b>${tierFormat(result, result.estimatedP99Ms, " ms", 1, result.confidenceTier)}</b>${varianceAlert ? `<small class="alert-inline">${esc(varianceAlert.message)}</small>` : ""}</span>` : ""}</div>` : "";
  const assumptions = result.assumptions.length ? result.assumptions : [result.algorithm.source];
  const alerts = simulationAlerts(result);
  const critical = alerts.find((alert) => alert.severity === "critical");
  const banner = critical ? `<div class="alert-banner critical" role="alert"><b>${esc(critical.message)}</b><button class="alert-dismiss" data-dismiss-alert aria-label="Dismiss alert">×</button></div>` : "";
  const infoAlert = alerts.find((alert) => alert.rule === "confidence");
  const live = getMeasuredResult(result.device.id, result.algorithm.id);
  const liveMarkup = live ? `<div class="notice info"><b>Measured live · ${esc(live.operation)}</b><br>${format(live.measurement.meanMs, " ms", 2)} mean across ${live.measurement.runCount} runs · ${esc(live.deviceFingerprint.firmwareBuildHash)} · ${esc(live.timestamp)}${live.measurement.p95Ms == null ? "" : ` · p95 ${format(live.measurement.p95Ms, " ms", 2)}`}${live.measurement.p99Ms == null ? "" : ` · p99 ${format(live.measurement.p99Ms, " ms", 2)}`}</div>` : "";
  $("#sim-result").innerHTML = `${banner}<div class="result-top"><div><h2>${esc(result.algorithm.name)}</h2><p>${esc(result.device.name)} · <span class="confidence ${esc(result.confidenceTier)}" title="${esc(result.confidenceReason)}">${esc(result.confidenceTier)}</span></p></div>${status(result.mwcVerdict)}</div><div class="result-metrics"><div class="result-stat"><small>Mean execution time</small><b title="${esc(result.confidenceReason)}">${tierFormat(result, result.estimatedTimeMs, " ms", 1)}</b></div><div class="result-stat"><small>Peak stack</small><b>${format(result.estimatedStackKB, " KB", 1)}</b></div><div class="result-stat"><small>Firmware flash</small><b title="${esc(result.flashFootprintReason)}">${format(result.estimatedFlashKB, " KB", 1)}</b></div><div class="result-stat"><small>Energy / operation</small><b>${tierFormat(result, result.estimatedEnergyMJ, " mJ", 2)}</b></div></div>${liveMarkup}${variance}<div class="result-foot"><span class="info" title="${esc(infoAlert?.message || result.confidenceReason)}">ⓘ</span><span>Device flash: ${result.device.flashKB.toLocaleString()} KB. ${esc(result.flashFootprintReason)} ${assumptions.map(esc).join(" ")}<br>Algorithm source: ${esc(result.algorithm.source)}<br>Device source: ${esc(result.device.source || "User-defined profile")}<br>Data ${esc(result.dataVersion)} · Engine ${esc(result.engineVersion)}</span></div><div class="notice ${result.mwcVerdict === "reliable" ? "info" : "warn"}"><b>MWC: ${esc(result.mwcVerdict)}</b> — ${esc(result.mwcReasons.join(" "))}</div>`;
}

function renderCompare() {
  const timed = compareResults.filter((r) => Number.isFinite(r.estimatedTimeMs));
  if (!compareResults.length) return;
  const max = Math.max(...timed.map((r) => r.estimatedTimeMs), 1);
  const criticalIds = new Set(compareResults.filter((r) => simulationAlerts(r).some((a) => a.severity === "critical")).map((r) => `${r.device.id}:${r.algorithm.id}`));
  const rowClass = (r) => criticalIds.has(`${r.device.id}:${r.algorithm.id}`) ? "critical-result" : "";
  $("#compare-results").innerHTML = timed.length ? `<div class="chart">${timed.map((r) => `<div class="bar-row ${rowClass(r)}"><div class="chart-label" title="${esc(r.device.name)} / ${esc(r.algorithm.name)} · ${esc(r.confidenceReason)}">${esc(r.device.name)} <span class="confidence ${esc(r.confidenceTier)}">${esc(r.confidenceTier)}</span></div><div class="bar-bg"><div class="bar-fill" style="width:${Math.max(2, r.estimatedTimeMs / max * 100)}%"></div></div><b>${tierFormat(r, r.estimatedTimeMs, " ms", 1)}</b></div>`).join("")}</div><div class="tagline">Critical configurations are outlined in red. Bars scale to the slowest scenario.</div>` : `<div class="notice warn">No selected scenario has a numeric time anchor.</div>`;
  $("#compare-table").innerHTML = `<table class="data-table"><thead><tr><th>Device</th><th>Algorithm</th><th>Mean</th><th>Measured live</th><th>Simulated illustrative</th><th>p95</th><th>p99</th><th>Stack</th><th>Flash</th><th>Energy</th><th>MWC</th><th>Confidence</th></tr></thead><tbody>${compareResults.map((r) => { const live = getMeasuredResult(r.device.id, r.algorithm.id), simulated = getWokwiResult(r.device.id, r.algorithm.id); return `<tr class="${rowClass(r)}"><td>${esc(r.device.name)}</td><td>${esc(r.algorithm.name)}</td><td>${tierFormat(r, r.estimatedTimeMs, " ms")}</td><td>${live ? `${format(live.measurement.meanMs, " ms", 2)} · ${esc(live.operation)}` : "—"}</td><td>${simulated ? `${format(simulated.elapsedMs, " ms", 3)} · ${esc(simulated.operation)}` : "—"}</td><td>${tierFormat(r, r.estimatedP95Ms, " ms", 1, r.p95ConfidenceTier)}</td><td>${tierFormat(r, r.estimatedP99Ms, " ms")}</td><td>${format(r.estimatedStackKB, " KB")}</td><td title="${esc(r.flashFootprintReason)}">${format(r.estimatedFlashKB, " KB")}</td><td>${tierFormat(r, r.estimatedEnergyMJ, " mJ", 2)}</td><td>${status(r.mwcVerdict)}</td><td title="${esc(r.confidenceReason)}">${esc(r.confidenceTier)}</td></tr>`; }).join("")}</tbody></table>`;
}

function tableExport(formatType) {
  if (!compareResults.length) { toast("Run a comparison before exporting."); return; }
  let content, type, ext;
  if (formatType === "json") { content = JSON.stringify(compareResults.map((r) => ({ ...r, measuredLive: getMeasuredResult(r.device.id, r.algorithm.id), simulatedIllustrative: getWokwiResult(r.device.id, r.algorithm.id), alerts: simulationAlerts(r) })), null, 2); type = "application/json"; ext = "json"; }
  else {
    const cols = [["Device", (r) => r.device.name], ["Algorithm", (r) => r.algorithm.name], ["Mean ms", (r) => r.estimatedTimeMs], ["Measured live ms", (r) => getMeasuredResult(r.device.id, r.algorithm.id)?.measurement.meanMs], ["Simulated illustrative ms", (r) => getWokwiResult(r.device.id, r.algorithm.id)?.elapsedMs], ["p50 ms", (r) => r.estimatedP50Ms], ["p95 ms", (r) => r.estimatedP95Ms], ["p99 ms", (r) => r.estimatedP99Ms], ["Stack KB", (r) => r.estimatedStackKB], ["Flash KB", (r) => r.estimatedFlashKB], ["Energy mJ", (r) => r.estimatedEnergyMJ], ["MWC", (r) => r.mwcVerdict], ["Confidence", (r) => r.confidenceTier]];
    const q = (x) => `"${String(x ?? "").replaceAll('"', '""')}"`;
    content = [cols.map(([h]) => q(h)).join(","), ...compareResults.map((r) => cols.map(([, fn]) => q(fn(r))).join(","))].join("\n"); type = "text/csv"; ext = "csv";
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = `pqc-iot-comparison.${ext}`; a.click(); URL.revokeObjectURL(a.href); toast(`${ext.toUpperCase()} export downloaded.`);
}

function renderNetwork(result) {
  const pct = result.successProbability * 100;
  const color = pct < 80 ? "var(--rose)" : pct < 95 ? "var(--orange)" : "var(--green)";
  const alerts = networkAlerts(result);
  const notices = alerts.map((alert) => `<div class="notice ${alert.severity === "warning" ? "warn" : "info"}" role="${alert.severity === "warning" ? "alert" : "note"}">${esc(alert.message)}</div>`).join("");
  $("#net-result").innerHTML = `<div class="result-top"><div><h2>${result.link === "802.15.4" ? "IEEE 802.15.4 / 6LoWPAN" : "LoRa link"}</h2><p>${result.payloadBytes.toLocaleString()} B payload · ${result.hops} hop${result.hops === 1 ? "" : "s"}</p></div><span class="pill">ANALYTIC</span></div><div class="result-metrics"><div class="result-stat"><small>Fragments</small><b>${result.fragmentCount}</b></div><div class="result-stat"><small>Payload / frame</small><b>${result.effectivePayloadPerFrame} B</b></div><div class="result-stat"><small>Datagram success</small><b style="color:${color}">${format(pct, "%", 2)}</b></div><div class="result-stat"><small>Effective throughput</small><b>Not available</b></div></div>${notices}<div class="result-foot"><span class="info">ⓘ</span><span>${esc(result.model)} Link data rates were not provided, so throughput is unavailable.${result.link === "lora" ? " LoRa capacity is an editable assumption." : " Effective 6LoWPAN payload uses 81 B single-hop or 45 B multi-hop."}</span></div>`;
}

function setView(name) {
  $$(".view").forEach((el) => el.classList.toggle("active", el.id === `view-${name}`));
  $$(".nav button").forEach((el) => el.classList.toggle("active", el.dataset.view === name));
  const active = $(`.nav button[data-view="${name}"]`); $("#crumb").textContent = active?.textContent.trim() || "Overview";
  if (name === "states") renderStatesDashboard();
  if (name === "hardware") renderHardwareSim();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderHardwareSim() {
  const deviceId = $("#hw-device").value || "rp2040", mapping = wokwiBoards[deviceId];
  if (mapping?.algorithmId) {
    $("#hw-algo").innerHTML = algorithms.filter((item) => item.id === mapping.algorithmId).map((algo) => `<option value="${esc(algo.id)}">${esc(algo.name)}</option>`).join("");
    $("#hw-algo").value = mapping.algorithmId;
    $("#hw-algo").disabled = true;
  } else {
    $("#hw-algo").disabled = true;
  }
  const algorithmId = $("#hw-algo").value || mapping?.algorithmId;
  const device = allDevices().find((item) => item.id === deviceId), algorithm = algorithms.find((item) => item.id === algorithmId);
  if (!device || !algorithm) return;
  $("#hw-project").innerHTML = mapping ? `<div class="notice info"><b>${esc(mapping.label)}</b><br>${esc(mapping.exactness)}. ${mapping.project ? `Local project: <code>wokwi-projects/${esc(mapping.project)}/</code>` : "No project sketch is included for this mapping yet."}</div>${mapping.project ? `<a class="btn primary" target="_blank" rel="noreferrer" href="https://wokwi.com/projects/new/${mapping.project === "rp2040" ? "pi-pico" : "attiny85"}">Open Wokwi editor ↗</a>` : ""}<p class="tagline">The included sketch runs a dummy workload only. Its timing is illustrative, not PQC performance.</p>` : `<div class="notice warn">Hardware simulation not available for ${esc(device.name)}. No supported Wokwi mapping is configured for this catalog profile.</div>`;
  const literature = simulate(device, algorithm, customs), live = getMeasuredResult(deviceId, algorithmId);
  const simulated = listWokwiResults().filter((item) => item.deviceId === deviceId && item.algorithmId === algorithmId);
  $("#hw-results").innerHTML = `<b>Literature / projection:</b> ${format(literature.estimatedTimeMs, " ms", 1)}<br><b>Measured live:</b> ${live ? `${format(live.measurement.meanMs, " ms", 2)} (${esc(live.operation)})` : "none imported"}<br><b>Simulated-illustrative:</b> ${simulated.length ? simulated.map((item) => `${esc(item.operation)} ${format(item.elapsedMs, " ms", 3)}`).join(" · ") : "none captured"}`;
  const last = simulated.at(-1);
  $("#hw-phase").textContent = last ? `Last parsed phase: ${last.operation} · ${last.elapsedMs} ms · ${last.implementation} workload · ${last.capturedAt}` : "No phase output captured for this selection.";
  $("#hw-run").disabled = !mapping?.project || Boolean(realtimeSessionId);
  $("#hw-stop").disabled = !realtimeSessionId;
}

function appendRealtimeLine(line) {
  realtimeEvents.push(line);
  if (realtimeEvents.length > 100) realtimeEvents.shift();
  $("#hw-event-log").textContent = realtimeEvents.join("\n");
  $("#hw-event-log").scrollTop = $("#hw-event-log").scrollHeight;
}
async function checkRealtimeBridge() {
  try {
    const response = await fetch(`${realtimeBridgeUrl}/api/health`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    $("#hw-bridge-status").textContent = "Local Wokwi bridge is available at 127.0.0.1:8787.";
  } catch {
    $("#hw-bridge-status").textContent = "Local bridge is offline. Run npm run realtime, then refresh or start a run.";
  }
}
function stopRealtimeStream() {
  realtimeEventSource?.close(); realtimeEventSource = null; realtimeSessionId = null;
  $("#hw-stop").disabled = true; $("#hw-run").disabled = !wokwiBoards[$("#hw-device").value]?.project;
}
function handleRealtimeEvent(item) {
  if (item.type === "status") {
    $("#hw-session-label").textContent = `Session ${realtimeSessionId} · ${item.status}${item.error ? ` · ${item.error}` : ""}`;
    appendRealtimeLine(`[${item.at}] session ${item.status}${item.error ? `: ${item.error}` : ""}`);
    if (["completed", "failed"].includes(item.status)) stopRealtimeStream();
    return;
  }
  if (item.type === "log") { appendRealtimeLine(`[${item.at}] ${item.stream}: ${item.line}`); return; }
  if (item.type === "rejected_event") { appendRealtimeLine(`[${item.at}] rejected: ${item.reason}`); return; }
  if (item.type !== "telemetry") return;
  const event = item.event;
  appendRealtimeLine(`[${item.at}] ${event.event}${event.operation ? ` · ${event.operation}` : ""}${Number.isFinite(event.elapsedUs) ? ` · ${(event.elapsedUs / 1000).toFixed(3)} ms` : ""}`);
  if (event.event === "operation_result") {
    importWokwiResult({ data_source: "simulated-illustrative", deviceId: event.deviceId, algorithmId: event.algorithmId, operation: event.operation, elapsedMs: event.elapsedUs / 1000, capturedAt: event.receivedAt, implementation: "stub" });
    saveWokwiResults(); renderHardwareSim(); renderStatesDashboard();
  }
}
async function startRealtimeWokwi() {
  const projectId = wokwiBoards[$("#hw-device").value]?.project;
  if (!projectId) return toast("This device has no allow-listed Wokwi project.");
  $("#hw-run").disabled = true; $("#hw-bridge-status").textContent = "Starting local Wokwi CLI…";
  try {
    const response = await fetch(`${realtimeBridgeUrl}/api/wokwi/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId }) });
    const session = await response.json();
    if (!response.ok) throw new Error(session.error || `Bridge returned HTTP ${response.status}`);
    realtimeSessionId = session.id; realtimeEvents = [];
    $("#hw-session-label").textContent = `Session ${session.id} · ${session.status}`;
    $("#hw-log-download").href = `${realtimeBridgeUrl}/api/wokwi/sessions/${session.id}/log`;
    $("#hw-log-download").hidden = false;
    appendRealtimeLine(`Connected to allow-listed ${projectId} project. Firmware is a dummy workload.`);
    realtimeEventSource?.close();
    realtimeEventSource = new EventSource(`${realtimeBridgeUrl}/api/wokwi/sessions/${session.id}/events`);
    realtimeEventSource.addEventListener("update", (message) => { try { handleRealtimeEvent(JSON.parse(message.data)); } catch { appendRealtimeLine("Ignored malformed bridge event."); } });
    realtimeEventSource.onerror = () => { if (realtimeSessionId) $("#hw-bridge-status").textContent = "Live stream disconnected; the local run may still be active."; };
    $("#hw-bridge-status").textContent = "Live Wokwi session connected. Output is illustrative only.";
    renderHardwareSim();
  } catch (error) {
    $("#hw-bridge-status").textContent = error.message;
    $("#hw-run").disabled = false;
  }
}
async function stopRealtimeWokwi() {
  if (!realtimeSessionId) return;
  const sessionId = realtimeSessionId;
  try { await fetch(`${realtimeBridgeUrl}/api/wokwi/sessions/${sessionId}/stop`, { method: "POST" }); }
  catch { $("#hw-bridge-status").textContent = "Could not reach the local bridge to stop this run."; }
}

$(".nav").addEventListener("click", (event) => { const button = event.target.closest("[data-view]"); if (button) setView(button.dataset.view); });
$("#states-export-pdf").addEventListener("click", downloadStatesPdf);
$("#states-export-numbers-pdf").addEventListener("click", downloadNumbersOnlyPdf);
$("#states-export-csv").addEventListener("click", () => downloadOperationData("csv"));
$("#states-export-json").addEventListener("click", () => downloadOperationData("json"));
for (const selector of ["#states-algo-filter", "#states-reference", "#states-catalog", "#states-custom", "#states-classical", "#states-log"]) $(selector).addEventListener("change", renderStatesDashboard);
$("#states-matrix").addEventListener("click", (event) => { const cell = event.target.closest("[data-state-device][data-state-algo]"); if (cell) renderStateDetail(cell.dataset.stateDevice, cell.dataset.stateAlgo); });
for (const chartId of ["states-time-chart", "states-ram-chart", "states-energy-chart", "states-network-chart", "states-variance-chart"]) $(`#${chartId}`).addEventListener("click", (event) => { const item = event.target.closest("[data-state-device][data-state-algo]"); if (item) renderStateDetail(item.dataset.stateDevice, item.dataset.stateAlgo); });
$("#states-detail").addEventListener("click", (event) => { const link = event.target.closest("[data-state-playground]"); if (!link) return; pgNodeIds.a = link.dataset.statePlayground; pgNodeIds.b = link.dataset.statePlayground; $("#pg-algo").value = link.dataset.statePlaygroundAlgo; populateSelectors(); setView("playground"); });
$("#view-states").addEventListener("click", (event) => { const button = event.target.closest("[data-chart]"); if (button) downloadChartPng(button.dataset.chart); });
document.addEventListener("click", (event) => { const go = event.target.closest("[data-go]"); if (go) setView(go.dataset.go); });
document.addEventListener("click", (event) => { const dismiss = event.target.closest("[data-dismiss-alert]"); if (dismiss) dismiss.closest(".alert-banner")?.remove(); });
$("#run-sim").addEventListener("click", () => { try { renderSimulation(simulate($("#sim-device").value, $("#sim-algo").value, customs)); } catch (e) { toast(e.message); } });
$("#measured-import").addEventListener("change", async (event) => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    const incoming = JSON.parse(await file.text()), results = (Array.isArray(incoming) ? incoming : [incoming]).map(validateMeasuredResult);
    for (const result of results) importMeasuredResult(result);
    saveMeasuredResults();
    if (latestResult) renderSimulation(latestResult);
    renderStatesDashboard();
    toast(`Imported ${results.length} KAT-verified live result${results.length === 1 ? "" : "s"}.`);
  } catch (error) { toast(error.message); }
  event.target.value = "";
});
$("#hw-device").addEventListener("change", renderHardwareSim);
$("#hw-algo").addEventListener("change", renderHardwareSim);
$("#hw-run").addEventListener("click", startRealtimeWokwi);
$("#hw-stop").addEventListener("click", stopRealtimeWokwi);
$("#hw-import").addEventListener("click", () => {
  try {
    const deviceId = $("#hw-device").value;
    if (!wokwiBoards[deviceId]?.project) throw new Error("This catalog device has no included Wokwi project.");
    const results = parseWokwiSerial($("#hw-serial").value, { deviceId, algorithmId: $("#hw-algo").value });
    saveWokwiResults();
    renderHardwareSim(); renderStatesDashboard();
    toast(`Imported ${results.length} simulated-illustrative serial reading${results.length === 1 ? "" : "s"}.`);
  } catch (error) { toast(error.message); }
});
$("#add-pair").addEventListener("click", () => { if (pairState.length >= 4) return toast("A comparison supports up to four scenarios."); pairState.push({ device: "rp2040", algo: "ml-kem-512" }); renderPairs(); });
$("#compare-pairs").addEventListener("change", (e) => { if (e.target.dataset.pairDevice != null) pairState[Number(e.target.dataset.pairDevice)].device = e.target.value; if (e.target.dataset.pairAlgo != null) pairState[Number(e.target.dataset.pairAlgo)].algo = e.target.value; });
$("#compare-pairs").addEventListener("click", (e) => { const btn = e.target.closest("[data-remove-pair]"); if (btn && pairState.length > 1) { pairState.splice(Number(btn.dataset.removePair), 1); renderPairs(); } });
$("#run-compare").addEventListener("click", () => { try { compareResults = pairState.map((pair) => simulate(pair.device, pair.algo, customs)); renderCompare(); } catch (e) { toast(e.message); } });
$("#export-csv").addEventListener("click", () => tableExport("csv")); $("#export-json").addEventListener("click", () => tableExport("json"));
$("#export-matrix-pdf").addEventListener("click", downloadMatrixPdf);
$("#matrix-algo").addEventListener("change", renderMatrix); $("#matrix-metric").addEventListener("change", renderMatrix);
$("#net-algo").addEventListener("change", (e) => { const algo = algorithms.find((a) => a.id === e.target.value); if (algo?.payloadBytes) $("#net-payload").value = algo.payloadBytes; else if (e.target.value) $("#net-payload").value = ""; });
$("#net-link").addEventListener("change", (e) => { $("#lora-field").style.display = e.target.value === "lora" ? "grid" : "none"; });
$("#run-network").addEventListener("click", () => { try { if ($("#net-payload").value === "") throw new Error("Enter a payload size; the selected algorithm has no size anchor."); const result = modelNetwork({ payloadBytes: Number($("#net-payload").value), link: $("#net-link").value, hops: Number($("#net-hops").value), lossRate: Number($("#net-loss").value) / 100, loraPayloadBytes: Number($("#net-lora-size").value) }); renderNetwork(result); } catch (e) { toast(e.message); } });

for (const key of ["a", "relay", "b"]) {
  $(`#pg-device-${key}`).addEventListener("change", (event) => {
    if (event.target.value === "__add_custom__") { event.target.value = pgNodeIds[key]; cancelPlayground("Add a profile to make it available in this node."); pendingAddNode = key; openModal(); return; }
    pgNodeIds[key] = event.target.value; cancelPlayground();
  });
}
$("#pg-algo").addEventListener("change", () => cancelPlayground());
$("#pg-link-type").addEventListener("change", () => cancelPlayground());
$("#pg-hops").addEventListener("input", () => { if (Number($("#pg-hops").value) < 1) $("#pg-hops").value = 1; cancelPlayground(); });
$("#pg-loss").addEventListener("input", () => cancelPlayground());
$("#pg-relay-toggle").addEventListener("change", (event) => { $("#pg-hops").value = event.target.checked ? Math.max(2, Number($("#pg-hops").value) || 1) : 1; cancelPlayground(); });
$("#pg-run").addEventListener("click", () => { try { runPlayground(); } catch (error) { toast(error.message); } });

function openModal(device = null) {
  editingDeviceId = device?.id ?? null;
  $("#device-modal").querySelector("h2").textContent = device ? "Edit custom device" : "Add a custom device";
  $("#custom-name").value = device?.name ?? ""; $("#custom-cpu").value = device?.cpu ?? "cortex-m0+";
  $("#custom-ram").value = device?.ramKB ?? ""; $("#custom-flash").value = device?.flashKB ?? "";
  $("#custom-clock").value = device?.clockMHz ?? ""; $("#custom-radio").value = device?.radio ?? "none";
  $("#device-modal").classList.add("open");
}
function closeModal() { $("#device-modal").classList.remove("open"); editingDeviceId = null; pendingAddNode = null; }
$("#open-add").addEventListener("click", () => openModal()); $("#close-modal").addEventListener("click", closeModal); $("#cancel-modal").addEventListener("click", closeModal);
$("#device-modal").addEventListener("click", (e) => { if (e.target.id === "device-modal") closeModal(); });
$("#device-form").addEventListener("submit", (e) => { e.preventDefault(); try { const device = makeCustomDevice({ name: $("#custom-name").value, cpu: $("#custom-cpu").value, ramKB: $("#custom-ram").value, flashKB: $("#custom-flash").value, clockMHz: $("#custom-clock").value, radio: $("#custom-radio").value }); const addNode = pendingAddNode; if (editingDeviceId) { device.id = editingDeviceId; customs = customs.map((d) => d.id === editingDeviceId ? device : d); } else customs.push(device); saveCustoms(); generateDeviceCatalog(customs); renderDeviceTable(); renderMatrix(); populateSelectors(); if (addNode) { pgNodeIds[addNode] = device.id; $(`#pg-device-${addNode}`).value = device.id; renderPlaygroundNodes(); } closeModal(); e.target.reset(); toast("Custom device profile saved."); } catch (error) { toast(error.message); } });
$("#device-table").addEventListener("click", (e) => { const edit = e.target.closest("[data-edit-device]"); if (edit) { const device = customs.find((d) => d.id === edit.dataset.editDevice); if (device) openModal(device); return; } const btn = e.target.closest("[data-delete-device]"); if (!btn) return; customs = customs.filter((d) => d.id !== btn.dataset.deleteDevice); saveCustoms(); renderDeviceTable(); renderMatrix(); populateSelectors(); toast("Custom profile deleted."); });
$("#download-report").addEventListener("click", () => { const report = `# PQC on constrained IoT: model notes\n\nThis tool projects published benchmark anchors; it does not implement cryptographic operations.\n\n## Method\n\nNumeric anchors are from the repository design notes. Times scale linearly with clock and use an assumed 1.85× M4/M7 speedup over M0+. Missing measurements remain unavailable.\n\n## MWC\n\n- Cortex-M0+ or better at 48 MHz or faster.\n- 64 KB RAM for KEM only; 128 KB for local signing.\n- 512 KB minimum flash; 1 MB recommended.\n\n## Network\n\nIEEE 802.15.4 uses 81 B/frame single hop and 45 B/frame multi-hop. Success is (1 - loss)^fragments, assuming independent per-frame loss. LoRa capacity defaults to a configurable 51 B assumption because the notes provide no constant.\n\n## Limitations\n\nEnergy/time scaling is approximate, side-channel behavior is not modeled, and custom profiles are extrapolated. The workspace contains design and implementation Markdown, but no source PDFs or numbered bibliography.\n\nSource: 01-DESIGN.md §§4.1–4.4; 02-IMPLEMENTATION.md §§3, 6, 8.\n`; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([report], { type: "text/markdown" })); a.download = "pqc-iot-method.md"; a.click(); URL.revokeObjectURL(a.href); });

  $("#report-version").textContent = `Benchmark data ${DATA_VERSION} · Estimation engine ${ENGINE_VERSION}`;
$("#hw-device").innerHTML = allDevices().map((device) => `<option value="${esc(device.id)}">${esc(device.name)}</option>`).join("");
$("#hw-device").value = "rp2040";
$("#hw-algo").innerHTML = algorithms.map((algo) => `<option value="${esc(algo.id)}">${esc(algo.name)}</option>`).join("");
$("#hw-algo").value = "ml-kem-512";
renderOverview(); renderDeviceTable(); renderReferences(); generateDeviceCatalog(customs); renderMatrix(); renderStatesDashboard(); populateSelectors(); renderHardwareSim(); checkRealtimeBridge();
