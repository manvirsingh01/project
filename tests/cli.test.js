import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const cli = join(root, "cli", "pqc-iot-sim.js");
const tempHome = mkdtempSync(join(tmpdir(), "pqc-iot-cli-test-"));
test.after(() => rmSync(tempHome, { recursive: true, force: true }));

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8", env: { ...process.env, HOME: tempHome } });
}

test("devices list shows five literature reference profiles", () => {
  const result = runCli(["devices", "list"]);
  assert.equal(result.status, 0, result.stderr);
  for (const name of ["CW308-STM32F3", "NUCLEO-L476RG", "STM32F4 Discovery", "RP2040", "NUCLEO-L4R5ZI"]) assert.match(result.stdout, new RegExp(name, "i"));
});

test("custom devices add and persist for later CLI commands", () => {
  const added = runCli(["devices", "add", "--name", "test board", "--ram", "96", "--flash", "512", "--clock", "64", "--cpu", "cortex-m0+"]);
  assert.equal(added.status, 0, added.stderr);
  assert.match(added.stdout, /custom-test-board/);
  const listed = runCli(["devices", "list", "--json"]);
  assert.equal(listed.status, 0, listed.stderr);
  assert.ok(JSON.parse(listed.stdout).some((device) => device.id === "custom-test-board"));
});

test("matrix command includes ten built-in devices and writes a PDF report", () => {
  const matrix = runCli(["matrix", "--json"]);
  assert.equal(matrix.status, 0, matrix.stderr);
  const rows = JSON.parse(matrix.stdout);
  assert.ok(rows.length >= 10);
  assert.equal(rows.find((row) => row.device.id === "attiny-avr").cells[0].verdict, "infeasible");
  const output = join(tempHome, "device-matrix.pdf");
  const exported = runCli(["matrix", "--export", "pdf", "--out", output, "--metric", "energy"]);
  assert.equal(exported.status, 0, exported.stderr);
  assert.match(readFileSync(output).toString("latin1", 0, 8), /%PDF-1\.4/);
});

test("states command supports the full JSON matrix and filters", () => {
  const full = runCli(["states", "--json"]);
  assert.equal(full.status, 0, full.stderr);
  const matrix = JSON.parse(full.stdout);
  assert.ok(matrix.length >= 10);
  assert.equal(matrix[0].device.id, "attiny-avr");
  assert.equal(matrix[0].cells.length, 8);
  const filtered = runCli(["states", "--algo", "ml-kem", "--device-type", "catalog", "--json"]);
  assert.equal(filtered.status, 0, filtered.stderr);
  const rows = JSON.parse(filtered.stdout);
  assert.equal(rows.length, 5);
  assert.ok(rows.every((row) => row.cells.length === 3 && row.cells.every((cell) => cell.algorithm.id.startsWith("ml-kem-"))));
});

test("CLI exact-anchor simulation exposes shared SimulationResult fields as JSON", () => {
  const result = runCli(["simulate", "--device", "rp2040", "--algo", "ml-kem-512", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.device.id, "rp2040");
  assert.equal(output.algo.id, "ml-kem-512");
  assert.equal(output.estimatedTimeMs, 35.7);
  assert.equal(output.estimatedStackKB, 9.4);
  assert.equal(output.estimatedEnergyMJ, 2.83);
  assert.equal(output.isExtrapolated, false);
  assert.equal(output.confidenceTier, "literature-exact");
  assert.ok(Array.isArray(output.alerts));
});

test("CLI network output matches the shared fragmentation and loss model", () => {
  const result = runCli(["network", "--algo", "ml-dsa-44", "--link", "802.15.4", "--hops", "1", "--loss", "0.02"]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.payloadBytes, 2420);
  assert.equal(output.fragmentCount, 30);
  assert.equal(output.successProbability, 0.98 ** 30);
  assert.ok(output.alerts.some((alert) => alert.rule === "low-reliability"));
  assert.ok(output.alerts.some((alert) => alert.rule === "fragmentation"));
});

test("persistent cache reuses results and --no-cache bypasses it", () => {
  const cacheFile = join(tempHome, ".pqc-iot-sim", "cache.json");
  rmSync(cacheFile, { force: true });
  const cold = runCli(["simulate", "--device", "rp2040", "--algo", "ml-kem-768", "--json", "-v"]);
  assert.match(cold.stderr, /cache miss/i);
  const warm = runCli(["simulate", "--device", "rp2040", "--algo", "ml-kem-768", "--json", "-v"]);
  assert.match(warm.stderr, /cache hit/i);
  const fresh = runCli(["simulate", "--device", "rp2040", "--algo", "ml-kem-768", "--json", "--no-cache", "-v"]);
  assert.match(fresh.stderr, /bypassed/i);
});

test("strict warnings fail CI and recorded runs power history regression alerts", () => {
  const warning = runCli(["network", "--algo", "ml-dsa-44", "--loss", "0.02", "--strict"]);
  assert.equal(warning.status, 1);
  assert.match(warning.stderr, /WARNING/);

  const historyPath = join(tempHome, ".pqc-iot-sim", "history.jsonl");
  mkdirSync(dirname(historyPath), { recursive: true });
  writeFileSync(historyPath, `${JSON.stringify({ timestamp: "2026-01-01T00:00:00.000Z", deviceId: "rp2040", algoId: "ml-kem-512", result: { estimatedTimeMs: 30 } })}\n`);
  const recorded = runCli(["simulate", "--device", "rp2040", "--algo", "ml-kem-512", "--record", "--json"]);
  const result = JSON.parse(recorded.stdout);
  assert.ok(result.alerts.some((alert) => alert.rule === "regression"));
  const history = runCli(["history", "--device", "rp2040", "--algo", "ml-kem-512"]);
  assert.match(history.stdout, /rp2040/);
  assert.match(history.stdout, /ml-kem-512/);
});

test("CLI returns documented failure codes and useful bad-input messages", () => {
  const infeasible = runCli(["simulate", "--device", "cw308-stm32f3", "--algo", "ml-dsa-44"]);
  assert.equal(infeasible.status, 1);
  const invalid = runCli(["simulate", "--device", "bogus-id", "--algo", "ml-kem-512"]);
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /Unknown device: bogus-id/);
  assert.doesNotMatch(invalid.stderr, /at .*\.js:/);
});

test("CSV output has a header and Markdown report includes all ten topic headings", () => {
  const csv = runCli(["simulate", "--device", "rp2040", "--algo", "ml-kem-512", "--csv"]);
  assert.equal(csv.status, 0, csv.stderr);
  assert.equal(csv.stdout.trim().split("\n").length, 2);
  assert.match(csv.stdout.split("\n")[0], /Device.*Algorithm.*Mean/);
  const report = runCli(["report", "--format", "md"]);
  assert.equal(report.status, 0, report.stderr);
  for (let section = 1; section <= 10; section++) assert.match(report.stdout, new RegExp(`## ${section}\\.`));
  const version = runCli(["--version"]);
  assert.equal(version.status, 0);
  assert.match(version.stdout, /data 1\.3\.0.*engine 1\.2\.0/);
});

test("references command prints the repository reference guide", () => {
  const result = runCli(["references"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Cryptographic standards modeled/);
  assert.match(result.stdout, /Technology used to build the app itself/);
});

test("raw export writes matching operation-level CSV, JSON, and numbers-only PDF", () => {
  const csvPath = join(tempHome, "pqc-iot-data.csv");
  const jsonPath = join(tempHome, "pqc-iot-data.json");
  const pdfPath = join(tempHome, "pqc-iot-data.pdf");
  const csv = runCli(["export", "--out", csvPath]);
  assert.equal(csv.status, 0, csv.stderr);
  const json = runCli(["export", "--format", "json", "--out", jsonPath]);
  assert.equal(json.status, 0, json.stderr);
  const rows = JSON.parse(readFileSync(jsonPath, "utf8"));
  assert.equal(rows.length, new Set(rows.map((row) => row.device_id)).size * 27);
  assert.equal(rows.find((row) => row.device_id === "rp2040" && row.algo_id === "ml-kem-512" && row.operation === "full_handshake").time_ms, 35.7);
  const csvLines = readFileSync(csvPath, "utf8").trimEnd().split("\n");
  assert.match(csvLines[0], /device_id.*operation.*time_ms.*source_citation.*note/);
  assert.equal(csvLines.length - 1, rows.length);
  const pdf = runCli(["export", "--format", "pdf", "--numbers-only", "--out", pdfPath]);
  assert.equal(pdf.status, 0, pdf.stderr);
  const pdfText = readFileSync(pdfPath).toString("latin1");
  assert.match(pdfText, /^%PDF-1\.4/);
  assert.doesNotMatch(pdfText, /\/XObject|\/Image/);
});
