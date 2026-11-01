# PQC-on-IoT Simulator — Implementation Plan

Companion to `PQC-IoT-Simulator-System-Report.md`, which identified three bugs (duplicated
Wokwi state, a hardcoded `"rp2040"` confidence check, and a Playground stack-headroom mismatch)
and a testing gap. This document turns that report into an executable plan: concrete phases,
file-by-file diffs, a module boundary the project should hold itself to afterward, and the
commands to verify each phase before moving to the next.

**Implementation status:** Phases 1–4 have been applied. The Wokwi state store is centralized,
confidence-tier eligibility uses the reference hardware fingerprint, and Playground stack
headroom shares the MWC threshold.

**Verification:** `npm run check` passed; `npm test` passed with 46 tests passing and one
Playwright-gated browser test skipped because Playwright is not installed. The plan's suggested
pre-change CLI baseline snapshots were not captured, so no byte-for-byte baseline diff was run.

Nothing in this plan changes a benchmark anchor, an MWC threshold, or an already-passing test's
expected value. It only removes dead code, fixes a mislabeled confidence tier, aligns two
divergent thresholds, and closes a coverage gap — in that order, because that is the order of
increasing risk to the shared `core/` engine every surface depends on.

---

## 0. Pre-flight — freeze a baseline

Before changing anything, capture a baseline so every later phase can be checked against it.

```sh
npm run check            # syntax check across core/, cli/, benchmark-data/, web/
npm test                 # node --test tests/*.test.js
node cli/pqc-iot-sim.js simulate --device rp2040 --algo ml-kem-512 --json > /tmp/baseline-kem.json
node cli/pqc-iot-sim.js simulate --device cw308-stm32f3 --algo ml-dsa-44 --json > /tmp/baseline-dsa.json
```

`npm test` must be green at this point. If it is not, stop — the plan below assumes it starts
from the repository's current passing state (as reflected in `tests/core.test.js`,
`tests/data.test.js`, `tests/alerts.test.js`, `tests/data-export.test.js`, `tests/cli.test.js`,
`tests/web.test.js`, `tests/references.test.js`, and the Playwright-gated
`tests/browser.test.js`).

---

## 1. Target module boundary (what "fixed" looks like)

The plan enforces one rule going forward, stated once so every phase below can be checked
against it:

> **`benchmark-data/` holds data only — no mutable state, no parsing, no import logic.**
> **`core/` holds all stateful/behavioral logic — one implementation per concern, never two.**

```
benchmark-data/
├── index.js        data: devices[], algorithms[], network{}, DATA_VERSION      (unchanged)
├── references.js   data: standards/tools/worksCited/crosswalk/technologies     (unchanged)
└── wokwi.js         data ONLY: wokwiBoards{}                                    ← Phase 2 shrinks this

core/
├── mwcRules.js      MWC_THRESHOLDS, classifyDevice()                           (unchanged)
├── variance.js      estimateVariance()                                        (unchanged)
├── index.js         simulate(), modelNetwork(), cache, custom-device factory   ← Phase 3 edits exactAnchor
├── alerts.js        simulationAlerts(), networkAlerts(), regressionAlert()     (unchanged)
├── deviceCatalog.js matrix + PDF builders                                      (unchanged)
├── dataExport.js    flat CSV/JSON/PDF builder                                  (unchanged)
├── measuredResults.js  measured-live store + validation                       (unchanged)
└── wokwi.js         simulated-illustrative store + validation  ← sole implementation after Phase 2
```

---

## 2. Phase 1 — close the test gap *before* touching production code

Rationale: `core/wokwi.js` is live, imported, and exercised by the browser at runtime, but has
no unconditional unit coverage (only the Playwright-gated `tests/browser.test.js` touches it
indirectly). Writing its tests first means Phase 2's refactor has a safety net from the start.

**New file:** `tests/wokwi.test.js`

```js
import test from "node:test";
import assert from "node:assert/strict";
import { getWokwiResult, importWokwiResult, listWokwiResults, parseWokwiSerial } from "../core/wokwi.js";

test("parseWokwiSerial extracts only well-formed operation,elapsed_ms lines", () => {
  const rows = parseWokwiSerial(
    "keygen,0.123\nnot-a-row\nencapsulate,0.087\n# comment\ndecapsulate,0.090",
    { deviceId: "rp2040", algorithmId: "ml-kem-512" }
  );
  assert.equal(rows.length, 3);
  assert.equal(getWokwiResult("rp2040", "ml-kem-512", "encapsulate").elapsedMs, 0.087);
});

test("parseWokwiSerial throws when no row matches and when device/algorithm are missing", () => {
  assert.throws(() => parseWokwiSerial("garbage", { deviceId: "rp2040", algorithmId: "ml-kem-512" }));
  assert.throws(() => parseWokwiSerial("keygen,1", {}));
});

test("importWokwiResult validates data_source, operation, and timing before storing", () => {
  assert.throws(() => importWokwiResult({ data_source: "measured-live" }));
  const stored = importWokwiResult({
    data_source: "simulated-illustrative", deviceId: "attiny-avr", algorithmId: "ml-dsa-44",
    operation: "sign", elapsedMs: 12.4, capturedAt: new Date().toISOString(), implementation: "stub"
  });
  assert.ok(listWokwiResults().includes(stored) === false); // importWokwiResult clones internally
  assert.equal(getWokwiResult("attiny-avr", "ml-dsa-44", "sign").elapsedMs, 12.4);
});

test("getWokwiResult without an operation returns the most recently captured reading", () => {
  importWokwiResult({ data_source: "simulated-illustrative", deviceId: "rp2040", algorithmId: "ml-kem-512", operation: "keygen", elapsedMs: 1, capturedAt: "2026-01-01T00:00:00.000Z", implementation: "stub" });
  importWokwiResult({ data_source: "simulated-illustrative", deviceId: "rp2040", algorithmId: "ml-kem-512", operation: "encapsulate", elapsedMs: 2, capturedAt: "2026-01-02T00:00:00.000Z", implementation: "stub" });
  const latest = getWokwiResult("rp2040", "ml-kem-512");
  assert.equal(latest.operation, "encapsulate");
});
```

**Verify:**
```sh
node --test tests/wokwi.test.js
```
Add it to the existing suites in `package.json` — `npm test` already runs `tests/*.test.js`,
so no script change is needed, but add a focused script for parity with the others:

```diff
   "test:cli": "node --test tests/cli.test.js",
+  "test:wokwi": "node --test tests/wokwi.test.js",
   "test:web": "node --test tests/web.test.js tests/browser.test.js"
```

**Exit criterion:** `npm test` green, `core/wokwi.js` now has direct coverage independent of
Playwright availability.

---

## 3. Phase 2 — collapse the duplicated Wokwi module

**File:** `benchmark-data/wokwi.js` — delete everything except `wokwiBoards`.

```diff
--- a/benchmark-data/wokwi.js
+++ b/benchmark-data/wokwi.js
@@
 // Only mappings backed by Wokwi's documented board list are marked available.
 export const wokwiBoards = {
   rp2040: { board: "wokwi-pi-pico", label: "Raspberry Pi Pico (RP2040)", project: "rp2040", algorithmId: "ml-kem-512", exactness: "same board family" },
   "attiny-avr": { board: "wokwi-attiny85", label: "ATtiny85", project: "attiny-avr", algorithmId: "ml-dsa-44", exactness: "representative part for the AVR device class" },
   stm32l031: { board: "board-st-nucleo-l031k6", label: "NUCLEO-L031K6", project: null, exactness: "same MCU family; different board" }
 };
-
-const operations = new Set(["keygen", "encapsulate", "decapsulate", "sign", "verify"]);
-const results = new Map();
-const keyOf = (entry) => `${entry.deviceId}:${entry.algorithmId}:${entry.operation}`;
-
-export function parseWokwiSerial(output, { deviceId, algorithmId, capturedAt = new Date().toISOString() }) {
-  ...
-}
-
-export function importWokwiResult(result) {
-  ...
-}
-
-export function getWokwiResult(deviceId, algorithmId, operation) {
-  ...
-}
-
-export function listWokwiResults() { return [...results.values()]; }
```

**File:** `core/wokwi.js` — no change. It is already the correct, sole implementation.

**File:** `web/app.js` — no change required. Its imports were already split correctly
(`wokwiBoards` from `benchmark-data/wokwi.js`, the four functions from `core/wokwi.js`), which
is exactly why this refactor is safe: the production code path doesn't move.

**File:** `cli/pqc-iot-sim.js` — no change. It never imported either Wokwi module (the
`hw-test` CLI command described in `10-REAL-PQC-PIPELINE.md` §5.2 remains unimplemented, as
the doc itself already discloses in its §9 "Repository integration status").

**File:** `benchmark-data/references.js` — update the one line that currently describes
`Wokwi project files` under `technologies[]` to reflect the single-implementation state, for
accuracy (optional, documentation-only):

```diff
-  { name: "Wokwi project files", usage: "Optional RP2040 and ATtiny85 illustrative dummy-workload sketches with phase LEDs and serial output.", status: "Used; no PQC library is linked" },
+  { name: "Wokwi project files", usage: "Optional RP2040 and ATtiny85 illustrative dummy-workload sketches with phase LEDs and serial output. Serial parsing and result storage live in core/wokwi.js only.", status: "Used; no PQC library is linked" },
```

If this string is changed, `tests/references.test.js` must be re-checked — it only asserts
`technologies.some((t) => t.name === "Node.js + native ES modules" && t.status === "Used")` and
a TypeScript "Not integrated" assertion, so this edit does not break it.

**Verify:**
```sh
npm run check     # confirms benchmark-data/wokwi.js still parses as valid JS
node --test tests/wokwi.test.js tests/web.test.js
npm test          # full suite, confirms nothing else referenced the deleted exports
```

**Exit criterion:** zero references to `parseWokwiSerial`/`importWokwiResult`/`getWokwiResult`/
`listWokwiResults` remain in `benchmark-data/wokwi.js` (verify with
`grep -rn "parseWokwiSerial\|importWokwiResult\|getWokwiResult\|listWokwiResults" benchmark-data/`
returning no hits), and `npm test` is still fully green.

---

## 4. Phase 3 — fix the hardcoded `"rp2040"` confidence check

**File:** `core/index.js`, inside `computeSimulation`.

```diff
--- a/core/index.js
+++ b/core/index.js
@@ function computeSimulation(device, algo) {
   const targetClock = Number(device.clockMHz) || 133;
   const timeScale = scaleTimeMs({ timeMs: 1, anchorCpu: "cortex-m0+", anchorClockMHz: 133, targetCpu: cpu, targetClockMHz: targetClock });
-  const exactAnchor = device.id === "rp2040" && Number(device.clockMHz) === 133 && hasTimeAnchor;
+  // "Measured" means this device is electrically identical to the literature anchor board
+  // (M0+ @133 MHz) AND is one of the shipped reference profiles — not merely id === "rp2040",
+  // which would also wrongly promote a same-spec custom device, and would wrongly demote the
+  // real anchor if its catalog id is ever renamed.
+  const exactAnchor = device.isReference === true && cpu === "cortex-m0+" && Number(device.clockMHz) === 133 && hasTimeAnchor;
```

**Add a regression test** to `tests/core.test.js`:

```diff
@@ test("confidence tiers distinguish measured, interpolated, extrapolated, and unsupported"
   assert.equal(simulate("stm32f4-disco", "ml-kem-512").confidenceTier, "extrapolated");
   assert.equal(simulate("rp2040", "lms-h25").confidenceTier, "unsupported");
 });

+test("a custom device numerically identical to the RP2040 anchor is interpolated, never measured", () => {
+  const clone = makeCustomDevice({ name: "RP2040 clone", cpu: "cortex-m0+", ramKB: 264, flashKB: 2048, clockMHz: 133 });
+  const result = simulate(clone, "ml-kem-512");
+  assert.equal(result.estimatedTimeMs, 35.7);
+  assert.equal(result.confidenceTier, "interpolated");
+});
+
+test("exactAnchor no longer depends on the literal device id", () => {
+  // Any reference-catalog M0+ @133MHz board should be eligible for "measured", not only
+  // the one whose id happens to be the literal string "rp2040".
+  const renamed = { ...devices.find((d) => d.id === "rp2040"), id: "rp2040-rev-b" };
+  assert.equal(simulate(renamed, "ml-kem-512").confidenceTier, "measured");
+});
```

**Verify:**
```sh
node --test tests/core.test.js
diff <(node cli/pqc-iot-sim.js simulate --device rp2040 --algo ml-kem-512 --json) /tmp/baseline-kem.json
diff <(node cli/pqc-iot-sim.js simulate --device cw308-stm32f3 --algo ml-dsa-44 --json) /tmp/baseline-dsa.json
```
Both diffs must be empty — the real `rp2040` device still satisfies `isReference === true &&
cpu === "cortex-m0+" && clockMHz === 133`, so its `confidenceTier` is unchanged; the
infeasible `cw308-stm32f3`/`ml-dsa-44` case never touched `exactAnchor` in the first place.

**Exit criterion:** baseline diffs empty, both new tests pass, full `npm test` green.

---

## 5. Phase 4 — align the Playground's stack-headroom explanation with `classifyDevice`

**File:** `web/app.js`.

```diff
--- a/web/app.js
+++ b/web/app.js
@@
 import { algorithms, classifyDevice, DATA_VERSION, devices, ENGINE_VERSION, getMeasuredResult, importMeasuredResult, listMeasuredResults, makeCustomDevice, modelNetwork, simulate, validateMeasuredResult } from "../core/index.js";
+import { MWC_THRESHOLDS } from "../core/mwcRules.js";
 import { networkAlerts, simulationAlerts } from "../core/alerts.js";
@@ function pgResultMarkup(resultA, resultB, networkResult, algo, relayAssessment = null) {
-  const lowerRam = [resultA, resultB].find((r) => r.estimatedStackKB != null && r.estimatedStackKB > r.device.ramKB);
+  const lowerRam = [resultA, resultB].find(
+    (r) => r.estimatedStackKB != null && r.device.ramKB < r.estimatedStackKB * MWC_THRESHOLDS.infeasibleRamRatio + r.estimatedStackKB * 0.2 /* same 20% headroom classifyDevice requires */
+  );
```

Simplify that to match `mwcRules.js` exactly (it uses a flat `* 1.2`, not the
`infeasibleRamRatio`, for the stack-headroom branch specifically — the plan should mirror the
actual rule, not re-derive a new one):

```diff
-  const lowerRam = [resultA, resultB].find(
-    (r) => r.estimatedStackKB != null && r.device.ramKB < r.estimatedStackKB * MWC_THRESHOLDS.infeasibleRamRatio + r.estimatedStackKB * 0.2
-  );
+  const lowerRam = [resultA, resultB].find(
+    (r) => r.estimatedStackKB != null && r.device.ramKB < r.estimatedStackKB * 1.2
+  );
```

(`MWC_THRESHOLDS` import can be dropped again if only the literal `1.2` is used — kept here as
an explicit anchor so a future change to `core/mwcRules.js`'s headroom multiplier is easy to
grep for from `web/app.js` as well; either is acceptable, but the multiplier value itself must
match `core/mwcRules.js` exactly, not be re-derived independently.)

**Verify (manual, since this is a DOM-rendering path):**
```sh
npm run start
```
Open **Playground**, set Node A/B to a custom device with `ramKB: 55`, algorithm `ML-DSA-44`
(`stackKB: 50.6`). Before the fix: badge shows `marginal`, prose falls through to generic
`mwcReasons` text. After the fix: badge still shows `marginal`, and the prose now also states
the stack/RAM relationship, matching what `classifyDevice`'s own `reasons[]` already says for
that cell in the States dashboard.

**Automated check (if Playwright is installed):**
```sh
node --test tests/browser.test.js
```
This suite's existing assertions (`pg-node.shake`, `pg-route.infeasible`,
`#pg-run` text `/why is this infeasible/i`) only cover the hard-infeasible `cw308-stm32f3` +
`ml-dsa-87` case, which is unaffected by this change (that case trips the architecture/RAM-floor
branch in `classifyDevice`, not the stack-headroom branch) — so it should pass unmodified, and
confirms this fix did not regress the one Playground path under automated coverage.

**Exit criterion:** manual check confirms the prose and the badge agree; `tests/browser.test.js`
(when runnable) unaffected; full `npm test` green.

---

## 6. Phase 5 — final verification and documentation sync

1. Re-run everything from Section 0's baseline capture and diff against the new baseline for
   every *other* device/algorithm pair spot-checked, to confirm Phases 1–4 changed exactly the
   three things intended and nothing else:

```sh
npm run check
npm test
node cli/pqc-iot-sim.js states --json > /tmp/after-states.json
node cli/pqc-iot-sim.js matrix --json > /tmp/after-matrix.json
```

2. Update `PQC-IoT-Simulator-System-Report.md`'s "Bugs found" section headers from "Bug #N" to
   "Bug #N — Fixed in Phase M" once each phase lands, so the report and the plan stay in sync
   for future readers (do not delete the original bug descriptions — they document *why* the
   fix is shaped the way it is, which matters more than the diff itself).

3. Confirm the module-boundary rule from Section 1 now holds exactly:

```sh
grep -rln "Map(" benchmark-data/        # should return nothing — no mutable state in benchmark-data/
grep -rln "function parseWokwiSerial\|function importWokwiResult" benchmark-data/   # should return nothing
```

4. Commit message convention (per `AGENTS.md`): short imperative subjects, one concern per
   commit, in this order —
   - `Add wokwi.js unit test coverage`
   - `Remove duplicated Wokwi state store from benchmark-data`
   - `Key measured confidence tier off device fingerprint, not literal id`
   - `Align Playground stack-headroom text with classifyDevice's 20% rule`

---

## 7. Why this order and not a single combined change

- Phase 1 (tests) before Phase 2 (deletion) means the deletion is provably behavior-preserving
  rather than "looked safe."
- Phase 2 (dead-code removal) before Phase 3 (confidence-tier logic) keeps the two changes in
  `core/index.js` and `benchmark-data/` independent and separately revertible — Phase 3 touches
  the one function (`computeSimulation`) that every numeric result in the entire app passes
  through, so it is kept isolated and backed by its own before/after CLI-output diff rather than
  bundled with an unrelated cleanup.
- Phase 4 (UI text) is last because it is the lowest-risk, purely cosmetic change, and benefits
  from Phase 3 already being settled (the Playground calls `simulate()` directly, so its
  displayed numbers are unaffected by Phase 3, but it's still good practice to stabilize the
  engine before touching its last consumer).
- Phase 5 exists because the System Report and this Plan are both living documents referenced
  by `AGENTS.md`'s PR guidance ("explain changes to benchmark assumptions, list validation
  performed") — closing the loop between "found" and "fixed" is part of the deliverable, not an
  afterthought.
