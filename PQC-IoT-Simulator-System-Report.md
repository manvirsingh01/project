# PQC-on-IoT Simulator — Full System Report, Data-Flow Map, and Bug Fixes

**Scope:** this report was produced by reading every file in the checkout (project brief,
research report, `core/`, `benchmark-data/`, `cli/`, `web/`, `wokwi-projects/`, `tests/`, and
all numbered `NN-*.md` design docs) and tracing how data actually moves between them at
runtime, as opposed to how the Markdown design docs describe it in prose. Three things are
separated below: (1) how the system is wired today, (2) concrete bugs/inconsistencies found by
cross-referencing files against each other and against `tests/*.test.js`, and (3) fixes.

No benchmark number is altered anywhere in this report — the project's own rule ("`null` means
the source did not provide a numeric anchor; it is intentionally not replaced with a guess")
is respected throughout.

---

## 1. System Map — what calls what

```
                          ┌─────────────────────────────┐
                          │   benchmark-data/index.js     │  ← single source of truth for
                          │   (devices, algorithms,       │     every numeric anchor
                          │    network constants)          │
                          └───────────────┬────────────────┘
                                           │
                 ┌─────────────────────────┼─────────────────────────┐
                 ▼                         ▼                         ▼
        core/mwcRules.js          core/variance.js            core/index.js
        classifyDevice()          estimateVariance()          simulate() / modelNetwork()
        (MWC verdicts)            (p50/p95/p99 model)         (orchestrates the two above,
                 │                         │                   owns the LRU cache)
                 └────────────┬────────────┘
                               ▼
                       core/index.js: computeSimulation()
                       → SimulationResult (the one shared shape
                         every surface renders)
                               │
        ┌──────────────┬───────┼───────────────┬───────────────────┐
        ▼              ▼       ▼               ▼                   ▼
 core/alerts.js  core/deviceCatalog.js  core/dataExport.js   core/measuredResults.js
 (rule-based     (matrix + PDF)         (flat CSV/JSON/PDF)  core/wokwi.js
  alerts)                                                    (measured-live /
                                                               simulated-illustrative
                                                               side-channels)
        │              │                       │                   │
        └──────┬───────┴───────────┬───────────┴─────────┬─────────┘
               ▼                   ▼                     ▼
        cli/pqc-iot-sim.js   web/app.js + web/index.html  tests/*.test.js
        (Node CLI, same      (browser UI, same core,      (only thing that proves
         core, its own       localStorage persistence)     core/web/cli agree)
         disk cache)
```

**The one architectural rule that actually holds the project together:** every number a human
sees — in the CLI table, the browser Simulator tab, the Compare table, the States dashboard,
or any exported CSV/JSON/PDF — passes through `core/index.js#simulate()` or
`core/index.js#modelNetwork()` exactly once. Nothing downstream (CLI formatting, `web/app.js`
rendering, PDF generation) re-derives a number independently. This is why `tests/web.test.js`
can assert things like `assert.match(app, /simulate\(\$\("#sim-device"\)\.value/)` — it's
checking that the browser didn't drift from the shared engine.

### 1.1 Per-file responsibility and inbound/outbound edges

| File | Owns | Reads from | Read by |
|---|---|---|---|
| `benchmark-data/index.js` | `devices[]`, `algorithms[]`, `network{}`, `DATA_VERSION` | — (leaf data module) | `core/index.js`, `core/deviceCatalog.js`, `core/dataExport.js`, `cli/`, `web/app.js`, `tests/data.test.js` |
| `benchmark-data/references.js` | citation/standards/technology tables | — | `web/app.js` (Method & sources page), `tests/references.test.js` |
| `benchmark-data/wokwi.js` | `wokwiBoards{}` mapping | — | `web/app.js` |
| `core/mwcRules.js` | `MWC_THRESHOLDS`, `classifyDevice()` | `benchmark-data` indirectly via caller-supplied device/algo objects | `core/index.js`, `core/deviceCatalog.js`, `web/app.js` (Playground verdicts) |
| `core/variance.js` | `estimateVariance()` — log-normal p50/p95 + percentile fallback | anchor object passed in | `core/index.js` only |
| `core/index.js` | `simulate()`, `modelNetwork()`, caching, custom-device factory, re-exports measured-result functions | `benchmark-data/index.js`, `core/mwcRules.js`, `core/variance.js`, `core/measuredResults.js` | `core/deviceCatalog.js`, `core/dataExport.js`, `core/alerts.js` (indirectly via result shape), `cli/`, `web/app.js`, almost every test file |
| `core/alerts.js` | `simulationAlerts()`, `networkAlerts()`, `regressionAlert()` | a `SimulationResult`/`NetworkResult` already produced by `core/index.js` | `cli/pqc-iot-sim.js`, `web/app.js` |
| `core/deviceCatalog.js` | `generateDeviceCatalog()`, `generateStateMatrix()`, `getFullMatrix()`, `createCatalogPdf()` | `benchmark-data/index.js`, `core/mwcRules.js`, `core/index.js#simulate` | `cli/`, `web/app.js` |
| `core/dataExport.js` | `getOperationLevelData()`, `operationDataToCsv()`, `createNumbersOnlyPdf()` | `benchmark-data/index.js`, `core/index.js#simulate`, `core/measuredResults.js#listMeasuredResults`, `core/wokwi.js#listWokwiResults` | `cli/`, `web/app.js` |
| `core/measuredResults.js` | `measured-live` validation + in-memory store | caller-supplied JSON (hardware import) | `core/index.js` (re-export), `core/dataExport.js`, `cli/`, `web/app.js` |
| `core/wokwi.js` | `simulated-illustrative` parsing + in-memory store | caller-supplied serial text | `core/dataExport.js`, `web/app.js` |
| `cli/pqc-iot-sim.js` | all CLI commands, disk cache (`~/.pqc-iot-sim/cache.json`), run history (`history.jsonl`) | every `core/*` module | — (leaf consumer) |
| `web/app.js` | DOM rendering for every tab, `localStorage` persistence of custom devices / measured-live / simulated-illustrative | every `core/*` module, both `benchmark-data/*.js` reference/wokwi files | `web/index.html` |

---

## 2. End-to-end data flow for one concrete number

Tracing **ML-KEM-512 on the RP2040 → `35.7 ms`** end to end, because this exact value is the
one every test suite anchors on (`tests/core.test.js`, `tests/data.test.js`,
`tests/cli.test.js`, `tests/browser.test.js` all assert it):

1. **Source of truth:** `benchmark-data/index.js` → `algorithms[].find(id === "ml-kem-512")`
   → `{ timeMs: 35.7, stackKB: 9.4, energyMJ: 2.83, ... }`, tagged
   `source: "01-DESIGN.md §4.2; M0+ @133 MHz"`.
2. **Device lookup:** `benchmark-data/index.js` → `devices[].find(id === "rp2040")` →
   `{ cpu: "cortex-m0+", ramKB: 264, flashKB: 2048, clockMHz: 133, isReference: true }`.
3. **Orchestration:** `core/index.js#simulate("rp2040", "ml-kem-512")` resolves both via
   `getDevice`/`getAlgorithm`, builds a cache key with `simulationCacheKey()`, and on a miss
   calls `computeSimulation(device, algo)`.
4. **Scaling:** `scaleTimeMs({ timeMs: 1, anchorCpu: "cortex-m0+", anchorClockMHz: 133,
   targetCpu: "cortex-m0+", targetClockMHz: 133 })` → `1.0` (identity scale, since the anchor
   board *is* the target board at its anchor clock). `estimatedTimeMs = 35.7 * 1.0 = 35.7`.
5. **Confidence tagging:** `exactAnchor` requires a shipped reference profile with normalized
   Cortex-M0+ CPU, 133 MHz clock, and a numeric anchor → `true` → `confidenceTier = "measured"`.
6. **MWC verdict:** `classifyDevice(device, [algo])` → RAM 264 KB ≥ 64 KB KEM floor, flash
   2048 KB ≥ 1024 KB recommended floor → `"reliable"`.
7. **Variance:** `estimateVariance(algo, 1.0)` — `cvPercent` is `null` for ML-KEM-512, so the
   function short-circuits to `{ p50Ms: null, p95Ms: null, p99Ms: null, model: null }` (KEM has
   no rejection-sampling variance to model; this is correct, not a gap).
8. **Result object** is cached, then fanned out to:
   - `core/alerts.js#simulationAlerts()` → no alerts (reliable, no tail-latency anchor).
   - `core/deviceCatalog.js` → one cell in every matrix/PDF.
   - `core/dataExport.js` → the `full_handshake` row for `rp2040` × `ml-kem-512`.
   - `cli/pqc-iot-sim.js` → `simulate --device rp2040 --algo ml-kem-512` table/JSON/CSV row.
   - `web/app.js#renderSimulation()` → Simulator tab, Compare tab, States dashboard cell,
     Playground node assessment.

Every one of those seven downstream surfaces is driven by the *same* cached object — this is
the property worth protecting when making any future change.

---

## 3. Bugs found

### Bug #1 — Fixed: duplicated, divergent Wokwi state store (`core/wokwi.js` vs `benchmark-data/wokwi.js`)

**Status:** fixed in Phase 2. `benchmark-data/wokwi.js` now contains only the board mapping;
`core/wokwi.js` owns the single parser and in-memory result store. Direct coverage was added in
`tests/wokwi.test.js`.

**Where:** `core/wokwi.js` and `benchmark-data/wokwi.js`.

**What's wrong:** these two files implement the *identical* logic — the same `operations` set,
the same private `results` Map, the same `parseWokwiSerial`, `importWokwiResult`,
`getWokwiResult`, `listWokwiResults` — but as two **separate module instances** with two
separate in-memory Maps. `benchmark-data/wokwi.js` additionally owns `wokwiBoards`, which is
genuinely data and belongs there.

`web/app.js` imports from both, but splits the import on purpose:

```js
import { wokwiBoards } from "../benchmark-data/wokwi.js";
import { getWokwiResult, importWokwiResult, listWokwiResults, parseWokwiSerial } from "../core/wokwi.js";
```

So in practice only `core/wokwi.js`'s Map is ever populated by the running app — the four
functions exported from `benchmark-data/wokwi.js` (`parseWokwiSerial`, `importWokwiResult`,
`getWokwiResult`, `listWokwiResults`) are **dead code that nothing imports**, but they are live,
exported, and `package.json`'s `check` script syntax-checks them (`node --check
benchmark-data/wokwi.js`), which gives a false sense that this file is "covered."

**Why it matters:**
- `benchmark-data/` is documented in `AGENTS.md` as "Benchmark data and its source index" —
  a data module, not a module with its own mutable state and import/parse logic. Having
  stateful logic duplicated into it breaks that boundary.
- If a future change (e.g. a stricter validation rule, or a new `operation` type) is made to
  one copy and not the other, the two will silently diverge. Since `web/app.js` currently reads
  only the `core/` copy, a contributor "fixing" `benchmark-data/wokwi.js` by itself would ship
  a no-op change and not notice, because nothing exercises that code path.
- **No test file imports either `parseWokwiSerial`/`importWokwiResult` directly** —
  `tests/*.test.js` has no `wokwi.test.js`. The only coverage is indirect, through
  `tests/browser.test.js`'s Playwright flow (which is itself skipped whenever Playwright isn't
  installed — see `test.skip: !chromium`). This means the actively-used `core/wokwi.js` has
  **zero unconditional unit-test coverage** in this repository, unlike every other `core/*`
  module (`mwcRules.js`, `variance.js`, `alerts.js`, `measuredResults.js`, `index.js`,
  `deviceCatalog.js`, `dataExport.js` are all directly covered by `tests/core.test.js`,
  `tests/alerts.test.js`, or `tests/data-export.test.js`).

**Fix:**

1. Delete the duplicated state/functions from `benchmark-data/wokwi.js`, leaving it as pure
   data:

```js
// benchmark-data/wokwi.js — AFTER
// Only mappings backed by Wokwi's documented board list are marked available.
export const wokwiBoards = {
  rp2040: { board: "wokwi-pi-pico", label: "Raspberry Pi Pico (RP2040)", project: "rp2040", algorithmId: "ml-kem-512", exactness: "same board family" },
  "attiny-avr": { board: "wokwi-attiny85", label: "ATtiny85", project: "attiny-avr", algorithmId: "ml-dsa-44", exactness: "representative part for the AVR device class" },
  stm32l031: { board: "board-st-nucleo-l031k6", label: "NUCLEO-L031K6", project: null, exactness: "same MCU family; different board" }
};
```

2. Keep `core/wokwi.js` as the single implementation (it already is the one in production use —
   no behavior change for the running app).
3. Add `tests/wokwi.test.js`, covering what currently has zero coverage:

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
  const stored = importWokwiResult({ data_source: "simulated-illustrative", deviceId: "attiny-avr", algorithmId: "ml-dsa-44", operation: "sign", elapsedMs: 12.4, capturedAt: new Date().toISOString(), implementation: "stub" });
  assert.equal(listWokwiResults().some((r) => r === stored || (r.deviceId === "attiny-avr" && r.operation === "sign")), true);
});
```

4. Update `package.json`'s `check` script — it still needs `benchmark-data/wokwi.js` checked
   (it still exists as data), no change required there, but the duplication risk is now gone.

### Bug #2 — Fixed: `exactAnchor` confidence tier is pinned to one hardcoded device id

**Status:** fixed in Phase 3. Exact-anchor eligibility now uses reference status, CPU family,
clock, and numeric-anchor availability. Regression coverage checks a custom clone and a renamed
reference profile.

**Where:** `core/index.js`, inside `computeSimulation`:

```js
const exactAnchor = device.id === "rp2040" && Number(device.clockMHz) === 133 && hasTimeAnchor;
```

**What's wrong:** the only way any simulation can ever reach `confidenceTier: "measured"` is if
the device object's `id` is the literal string `"rp2040"`. This is brittle in two concrete,
reproducible ways:

- A **custom device** built with `makeCustomDevice({ name: "RP2040 clone", cpu: "cortex-m0+",
  ramKB: 264, flashKB: 2048, clockMHz: 133 })` has bit-for-bit identical electrical
  characteristics to the real anchor board, but gets `id: "custom-rp2040-clone"`, so
  `exactAnchor` is `false` and it is reported as `"interpolated"` rather than `"measured"` —
  even though no scaling at all is actually being applied (`timeScale === 1` in both cases).
  The *reported* confidence is lower than the *actual* numerical fidelity.
- If `benchmark-data/index.js`'s `rp2040` entry is ever renamed (e.g. to disambiguate a second
  Pico variant, `rp2040-w`), every test and every "measured" badge in the UI silently
  degrades to "interpolated" with no error, no test failure message pointing at the cause, and
  no comment at the renamed call site warning that this is the single place that cares about
  the literal id string.

**Why the tests didn't catch it:** `tests/core.test.js`'s custom-device test only checks that
`isExtrapolated === true` for a *different*-clocked custom device (64 MHz, not 133 MHz), so it
never exercises the "custom device with identical specs to the anchor" case that exposes the
mismatch between numerical fidelity and reported confidence.

**Fix:** key "exact anchor" off the *fingerprint* (cpu/clock) the engine already uses for
caching, not off the device's `id`, and restrict it to the shipped reference catalog so a
user-entered custom device is never silently promoted to "measured" (which should stay
reserved for the literal literature board):

```js
// core/index.js — AFTER
const exactAnchor =
  device.isReference === true &&
  customCpu(device) === "cortex-m0+" &&
  Number(device.clockMHz) === 133 &&
  hasTimeAnchor;
```

This keeps today's behavior for the shipped `rp2040` entry (it is `isReference: true`, CPU
`cortex-m0+`, clock `133`) and for every other reference board that happens to also be an
M0+ @133 MHz anchor in the future, without requiring the literal id `"rp2040"` — while still
correctly refusing "measured" for any `isReference: false` custom device, since a user-entered
clone has not actually been benchmarked in the literature, only numerically identical to a
board that was.

Add a regression test to lock this in:

```js
test("a custom device numerically identical to the RP2040 anchor is interpolated, never measured", () => {
  const clone = makeCustomDevice({ name: "RP2040 clone", cpu: "cortex-m0+", ramKB: 264, flashKB: 2048, clockMHz: 133 });
  const result = simulate(clone, "ml-kem-512");
  assert.equal(result.estimatedTimeMs, 35.7);           // identical numeric scaling
  assert.equal(result.confidenceTier, "interpolated");  // but never silently promoted to "measured"
});
```

### Bug #3 — Fixed: Playground's own stack/RAM check diverges from `classifyDevice`'s headroom rule

**Status:** fixed in Phase 4. The Playground uses the shared `MWC_THRESHOLDS.stackHeadroomRatio`
that `classifyDevice()` uses, so its explanation follows the same 20% rule.

**Where:** `web/app.js#pgResultMarkup()`:

```js
const lowerRam = [resultA, resultB].find((r) => r.estimatedStackKB != null && r.estimatedStackKB > r.device.ramKB);
```

versus `core/mwcRules.js#classifyDevice()`:

```js
if (peakStackKB && ramKB < peakStackKB * 1.2) {
  return { verdict: "marginal", reasons: [...] };
}
```

**What's wrong:** the MWC rule treats a device as only `marginal` (not yet `infeasible`) the
moment RAM dips under stack-size × 1.2 — i.e. it wants **20% headroom** above the peak stack
requirement before calling a configuration safe. The Playground's own prose explanation
(`pgResultMarkup`'s `reason` string, shown directly under the "exchange" verdict) only fires
its *own* "stack exceeds RAM" sentence when stack is **literally larger than total RAM**
(`estimatedStackKB > device.ramKB`, i.e. 0% headroom, not 20%).

Concretely: a device with `ramKB = 55` running `ML-DSA-44` (`stackKB: 50.6`) is classified
`marginal` by `classifyDevice` (55 < 50.6 × 1.2 = 60.72), and the Playground node badge will
correctly show `marginal` — but the human-readable sentence under the result strip will *not*
mention the stack/RAM relationship at all (`55 > 50.6` is false), falling through to printing
`resultA.mwcReasons`/`resultB.mwcReasons` instead, which is a different (and differently worded)
explanation path than the one used for a *harder* failure. The visible badge and the visible
prose can therefore describe the same situation via two different code paths with two different
thresholds, which is confusing when debugging "why did this say marginal" from the UI alone.

**Fix:** have the Playground's explanatory text reuse the same 20%-headroom threshold instead
of re-deriving its own 0%-headroom one, by importing `MWC_THRESHOLDS` and comparing like
`classifyDevice` does:

```js
// web/app.js — AFTER
import { MWC_THRESHOLDS } from "../core/mwcRules.js";
// ...
const lowerRam = [resultA, resultB].find(
  (r) => r.estimatedStackKB != null && r.device.ramKB < r.estimatedStackKB * 1.2
);
```

This makes the Playground's prose and `classifyDevice`'s badge agree on the exact same boundary,
so a `marginal` verdict is always accompanied by a stack-headroom explanation when that is in
fact the binding constraint, not just when the device is already catastrophically undersized.

---

## 4. Non-bugs worth documenting (so they are not "re-discovered" later)

These were checked and found to be **intentional, internally consistent** design choices, not
defects — listed here because the report was asked to be exhaustive and because distinguishing
"looks odd but is correct" from "is actually wrong" is the main value of this kind of review.

- **`ML-DSA-65` has `cvPercent: null` and `p99Ms: null`** in `benchmark-data/index.js`, while
  `ML-DSA-44` and `ML-DSA-87` have partial variance data. `estimateVariance()` correctly falls
  through to its "unsupported" branch for 65 rather than fabricating a CV. Confirmed by
  `tests/data.test.js`: `assert.deepEqual([algo["ml-dsa-65"].timeMs, algo["ml-dsa-65"].stackKB], [256.6, 77.6]);` with no CV/p99 assertion, and `tests/data-export.test.js`'s explicit
  `assert.deepEqual([sign65.cv_percent, sign65.p99_ms], [null, null]);`.
- **`attiny-avr` and `msp430fr` always return `confidenceTier: "unsupported"`** regardless of
  algorithm, via the `architectureExcluded` check (`["avr-8bit", "msp430-16bit"].includes(device.cpu)`), which matches the research report's §8.1 architecture floor (32-bit
  Cortex-M0+ minimum) and is exercised by `tests/core.test.js`'s
  `simulate("attiny-avr", "ml-kem-512").confidenceTier === "unsupported"`.
- **LoRa's 51-byte default payload-per-frame** is explicitly flagged in three independent
  places (`benchmark-data/index.js`'s `loraPayloadSource` string, `README.md`'s "Model limits"
  section, and the in-app "Model assumptions" notice) as a configurable assumption, not a cited
  constant — this is honest labeling, not a hidden guess.
- **`core/deviceCatalog.js#createCatalogPdf` reading both `cell.verdict` and `cell.mwcVerdict`**
  (`const verdict = cell.verdict || cell.mwcVerdict || "infeasible";`) is intentional: the CLI's
  `matrix` command passes `classifyDevice()`'s raw `{verdict, reasons}` shape, while the States
  dashboard's PDF export passes a `SimulationResult`-shaped `{mwcVerdict, mwcReasons}`. This is
  one function deliberately serving two slightly different callers rather than a typo.

---

## 5. Recommended order of operations to apply these fixes safely

1. Add `tests/wokwi.test.js` **first**, against the current (duplicated) state, to lock in
   `core/wokwi.js`'s existing behavior before touching anything.
2. Apply **Bug #1**'s fix (delete the dead duplicate logic from `benchmark-data/wokwi.js`).
   Re-run `npm test` and `npm run check` — both should still pass, since nothing imported the
   deleted exports.
3. Add the regression test from **Bug #2**, confirm it fails against current `core/index.js`,
   then apply the `exactAnchor` fix and confirm it passes alongside every existing
   `tests/core.test.js` assertion (none of which depend on the literal id check, since they
   all use the real `"rp2040"` device which still satisfies the new condition).
4. Apply **Bug #3**'s fix in `web/app.js`, then re-run `tests/browser.test.js` (requires
   Playwright) to confirm the Playground's infeasible/marginal/reliable styling (`pg-route`
   classes, `pg-node.shake`) is unaffected, since that test only asserts on `classifyDevice`
   verdicts, which do not change.
5. Run the full suite: `npm run check && npm test`.

None of these three fixes change any numeric anchor in `benchmark-data/index.js`, any MWC
threshold in `core/mwcRules.js`, or any already-passing test's expected value — they correct
dead/duplicated code, a mislabeled confidence tier, and a UI-text/badge mismatch, which is the
right scope for a bug-fix pass on a project whose stated contract (`AGENTS.md`) is "do not
silently invent benchmark measurements."
