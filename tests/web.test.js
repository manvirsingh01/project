import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const [html, app] = await Promise.all([
  readFile(join(root, "web", "index.html"), "utf8"),
  readFile(join(root, "web", "app.js"), "utf8")
]);

test("browser app is offline-capable and exposes every documented view", () => {
  for (const view of ["overview", "devices", "simulator", "playground", "hardware", "compare", "states", "network", "report"]) {
    assert.match(html, new RegExp(`data-view="${view}"`));
    assert.match(html, new RegExp(`id="view-${view}"`));
  }
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/i);
  assert.doesNotMatch(app, /\bfetch\s*\(/);
  assert.match(html, /prefers-color-scheme:\s*dark/);
});

test("Method & sources page combines methodology and reference sections", () => {
  for (const id of ["view-report", "reference-project-sources", "reference-standards", "reference-tools", "reference-works", "reference-crosswalk", "reference-technologies", "reference-documents"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.doesNotMatch(html, /id="view-references"|data-view="references"/);
  assert.ok(html.indexOf("id=\"view-report\"") < html.indexOf("id=\"reference-project-sources\""));
  assert.match(app, /from "\.\.\/benchmark-data\/references\.js"/);
  assert.match(app, /function renderReferences\(\)/);
  assert.match(html, /anchor-to-paper mappings are left explicit/);
});

test("simulator, network, and playground use the shared core and animation honors reduced motion", () => {
  assert.match(app, /from "\.\.\/core\/index\.js"/);
  assert.match(app, /from "\.\.\/core\/alerts\.js"/);
  assert.match(app, /DATA_VERSION/);
  assert.match(app, /simulate\(\$\("#sim-device"\)\.value/);
  assert.match(app, /modelNetwork\(\{/);
  assert.match(app, /simulate\(deviceA, algo\)/);
  assert.match(app, /successProbability/);
  assert.match(app, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(app, /pgAddPackets\(links\[i\], visualFragmentCount/);
  assert.match(app, /pgTimers\.clear\(\)/);
});

test("device catalog matrix and browser PDF export are wired to shared catalog functions", () => {
  assert.match(html, /id="matrix-table"/);
  assert.match(html, /id="export-matrix-pdf"/);
  assert.match(app, /generateStateMatrix\(customs\)/);
  assert.match(app, /createCatalogPdf/);
  assert.match(app, /generateDeviceCatalog\(customs\)/);
});

test("states dashboard exposes comparisons and raw operation-level exports", () => {
  for (const id of ["view-states", "states-algo-filter", "states-summary", "states-matrix", "states-time-chart", "states-ram-chart", "states-energy-chart", "states-network-chart", "states-variance-chart", "states-export-pdf", "states-export-numbers-pdf", "states-export-csv", "states-export-json"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(app, /getFullMatrix\(selected, algoList\)/);
  assert.match(app, /getOperationLevelData\(allDevices\(\)\)/);
  assert.match(app, /createNumbersOnlyPdf/);
  assert.match(app, /renderStateDetail/);
  assert.match(app, /downloadChartPng/);
  assert.match(app, /renderStatesDashboard\(\)/);
});
