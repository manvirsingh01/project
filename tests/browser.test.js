import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let chromium = null;
try { ({ chromium } = await import("playwright")); } catch { /* Browser coverage is optional when Playwright is not installed. */ }

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json" };

test("browser surfaces and Playground flows stay wired to live core results", { skip: !chromium && "Install Playwright to run browser integration coverage." }, async (t) => {
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, "http://localhost").pathname;
      const relative = pathname === "/" ? "index.html" : pathname.slice(1);
      const file = resolve(join(root, relative));
      if (file !== root && !file.startsWith(`${root}/`)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" }); res.end(body);
    } catch { res.writeHead(404).end("Not found"); }
  });
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); await new Promise((resolvePromise) => server.close(resolvePromise)); });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);

  await page.locator('[data-view="simulator"]').click();
  await page.locator("#run-sim").click();
  assert.match(await page.locator("#sim-result").innerText(), /35\.7\s*ms/);

  await page.locator('[data-view="devices"]').click();
  await page.locator("#open-add").click();
  await page.locator("#custom-name").fill("Browser test node");
  await page.locator("#custom-ram").fill("96");
  await page.locator("#custom-flash").fill("512");
  await page.locator("#custom-clock").fill("64");
  await page.locator('#device-form button[type="submit"]').click();
  assert.match(await page.locator("#device-table").innerText(), /Browser test node/);
  await page.locator('[data-view="simulator"]').click();
  await page.locator("#sim-device").selectOption("custom-browser-test-node");
  await page.locator("#run-sim").click();
  assert.match(await page.locator("#sim-result").innerText(), /interpolated/);

  await page.locator('[data-view="compare"]').click();
  await page.locator('[data-pair-device="0"]').selectOption("cw308-stm32f3");
  await page.locator('[data-pair-algo="0"]').selectOption("ml-dsa-87");
  await page.locator('[data-pair-device="1"]').selectOption("rp2040");
  await page.locator('[data-pair-algo="1"]').selectOption("ml-kem-512");
  await page.locator("#run-compare").click();
  assert.equal(await page.locator("#compare-table tr.critical-result").count(), 1);

  await page.locator('[data-view="states"]').click();
  assert.ok(await page.locator("#states-matrix tbody tr").count() >= 10);
  for (const button of ["states-export-numbers-pdf", "states-export-csv", "states-export-json"]) assert.equal(await page.locator(`#${button}`).count(), 1);
  assert.match(await page.locator("#states-summary").innerText(), /Reliable/);
  await page.locator("#states-matrix .state-cell").first().click();
  assert.match(await page.locator("#states-detail").innerText(), /MWC state/);
  await page.locator("#states-algo-filter").selectOption("ml-dsa-87");
  assert.equal(await page.locator("#states-matrix thead th").count(), 2);

  await page.locator('[data-view="playground"]').click();
  await page.locator("#pg-device-a").selectOption("rp2040");
  await page.locator("#pg-device-b").selectOption("rp2040");
  await page.locator("#pg-algo").selectOption("ml-kem-512");
  await page.locator("#pg-loss").fill("0");
  await page.locator("#pg-run").click();
  await page.waitForFunction(() => document.querySelectorAll("#pg-link-1 .packet").length === 1);
  await page.waitForTimeout(600);

  await page.locator("#pg-algo").selectOption("ml-dsa-44");
  await page.locator("#pg-run").click();
  await page.waitForFunction(() => document.querySelectorAll("#pg-link-1 .packet").length === 30);
  assert.equal(await page.locator("#pg-pulse-row .pg-pulse").count(), 4);
  await page.waitForTimeout(1500);
  assert.equal(await page.locator("#pg-result").getAttribute("data-retry-shown"), "false");

  await page.locator("#pg-algo").selectOption("ml-dsa-87");
  await page.locator("#pg-run").click();
  assert.equal(await page.locator("#pg-pulse-row .pg-pulse").count(), 5);
  await page.waitForTimeout(1200);

  await page.locator("#pg-algo").selectOption("ml-dsa-44");
  await page.locator("#pg-relay-toggle").check();
  await page.locator("#pg-run").click();
  await page.waitForFunction(() => document.querySelectorAll("#pg-link-2 .packet").length === 54);
  await page.waitForTimeout(900);

  await page.locator("#pg-loss").fill("3");
  await page.locator("#pg-run").click();
  await page.waitForFunction(() => document.querySelector("#pg-result")?.dataset.retryShown === "true");
  await page.waitForTimeout(1200);

  await page.locator('[data-view="network"]').click();
  await page.locator("#net-algo").selectOption("ml-dsa-44");
  await page.locator("#net-loss").fill("2");
  await page.locator("#run-network").click();
  assert.match(await page.locator("#net-result").innerText(), /30/);
  assert.match(await page.locator("#net-result").innerText(), /54\.5/);

  await page.locator('[data-view="playground"]').click();
  await page.locator("#pg-loss").fill("0");
  await page.locator("#pg-run").click();
  await page.locator("#pg-device-b").selectOption("nucleo-l4r5zi");
  assert.equal(await page.locator(".packet").count(), 0, "swapping a node cancels and clears the active packet run");
  await page.waitForTimeout(3100);
  assert.equal(await page.locator(".packet").count(), 0, "cancelled animations leave no packet elements or timers");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("#pg-run").click();
  assert.match(await page.locator("#pg-result").innerText(), /exchange/);
  assert.equal(await page.locator(".packet").count(), 0);

  await page.locator("#pg-relay-toggle").uncheck();
  await page.locator("#pg-device-a").selectOption("cw308-stm32f3");
  await page.locator("#pg-algo").selectOption("ml-dsa-87");
  await page.locator("#pg-run").click();
  assert.ok((await page.locator("#pg-node-a").getAttribute("class")).includes("shake"));
  assert.ok((await page.locator("#pg-route").getAttribute("class")).includes("infeasible"));
  assert.match(await page.locator("#pg-run").innerText(), /why is this infeasible/i);
  await page.emulateMedia({ colorScheme: "dark" });
  assert.notEqual(await page.locator("body").evaluate((node) => getComputedStyle(node).backgroundColor), "rgb(243, 246, 250)");
  assert.deepEqual(errors, []);
});
