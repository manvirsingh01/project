# PQC-on-IoT Simulator — Benchmarking, Caching & Alerting

Companion to `01-DESIGN.md`, `02-IMPLEMENTATION.md`, `03-PLAYGROUND.md`, and `04-TESTING.md`.
Those define the system, the build plan, the animated screen, and how to verify correctness.
This file goes deep on three things those only touched briefly: **the benchmarking
methodology itself** (what's actually being measured/modeled and how faithfully), **a caching
layer** so repeated simulations are fast and consistent, and **an alerting layer** so a user —
or a CI pipeline — is actively told when a result crosses into risky territory, not just shown
a quiet badge.

## 1. Benchmarking methodology — full detail

The simulator doesn't run real cryptography, so "benchmarking" here means two linked things:
(a) faithfully encoding the ten methodologies the source literature used to produce its
numbers, so the Report tab is accurate about *how* those numbers were obtained, and (b)
applying consistent, auditable math when the engine has to project a number the literature
didn't measure directly. Both are detailed below.

### 1.1 The ten source methodologies, encoded

| # | Methodology | What it measured in the literature | How the simulator represents it |
|---|---|---|---|
| 1 | Cycle-accurate execution profiling | CPU clock cycles via DWT/SysTick counters, isolated from clock frequency | Stored as the `timeMs` anchor at a known `clockMHz`; the engine's clock-scaling formula (§3.1 of `02-IMPLEMENTATION.md`) is the simulator's stand-in for re-deriving cycle counts at a different frequency |
| 2 | Zero wait-state execution | 24 MHz clocking to remove Flash-fetch latency from the measurement | Anchors are taken at the literature's reported clock speed; the simulator does not attempt to model wait-state/cache effects — documented as a simplification (§6) |
| 3 | Statistical variance analysis | 100+ repeated signing runs → mean, SD, CV%, p95/p99 | Stored per signature algorithm as `cvPercent` and `p99Ms`; §1.3 below defines how the engine derives p95 and confidence bands the source report didn't explicitly publish |
| 4 | Static flash/memory tracking | `.text`/`.data`/`.rodata` segment sizes via `arm-none-eabi-gcc` toolchain analysis | Represented as a single `flashFootprintKB` per algorithm (not segment-split in v1; segment breakdown is a stretch goal, §7) |
| 5 | Dynamic stack instrumentation | Stack-painting (canary values) + high-water-mark measurement | Stored as `stackKB` per algorithm/device pair — the figure the MWC rule (§4.4 of `01-DESIGN.md`) is built on |
| 6 | Empirical energy modeling | `Energy = Power × Time`, using datasheet active-mode current | Stored as `energyMJ`; extrapolated results recompute energy as `anchorEnergy × (estimatedTime / anchorTime)`, preserving the same power-draw assumption |
| 7 | Cross-architecture functional equivalence (KATs) | Bit-for-bit output comparison between embedded target and host reference implementation | Out of scope — the simulator produces no cryptographic output to compare; noted explicitly in the Report tab so this isn't implied to be covered |
| 8 | Network-level fragmentation simulation | 802.15.4/6LoWPAN fragment counts, loss modeling | Fully modeled — this is the Network tab / Playground fragment-train feature; see §2 for the caching treatment of these computations |
| 9 | Side-channel leakage characterization | TVLA/EM/power-trace analysis | Out of scope, qualitative mention only (per `01-DESIGN.md` §3) |
| 10 | Hardware-software co-design area-time profiling | LUTs/FFs/kGE for FPGA/ASIC accelerators | Out of scope — the simulator targets software-only microcontroller execution, not custom silicon |

Methodologies 7, 9, and 10 are **explicitly marked unsupported** in the Report tab and in CLI
`--help` text, rather than silently omitted, so a user doesn't assume the tool covers more than
it does.

### 1.2 Anchor vs. extrapolation, formalized

Every number the engine returns carries a **confidence tier**, not just a boolean
`isExtrapolated` flag:

| Tier | Meaning | Example |
|---|---|---|
| `literature-exact` | Directly matches a literature anchor, same device, same algorithm | RP2040 + ML-KEM-512 |
| `interpolated` | Same CPU family and architecture features (DSP/SIMD) as an anchor, only clock/RAM differ | A custom Cortex-M4 at 96 MHz, between the STM32F4 Discovery's anchor and a slower M4 |
| `extrapolated` | Different CPU family/feature set than the nearest anchor (e.g. M0+ anchor scaled to a hypothetical Cortex-M7, or vice versa) | Any custom device whose `hasDSP` differs from the nearest same-algorithm anchor |
| `unsupported` | No anchor exists for this algorithm on any reference device, and the device is too dissimilar to any anchor to extrapolate responsibly | e.g. SLH-DSA full numeric benchmarking (literature only gives signature size, not timing) |

The tier is surfaced everywhere a number appears — CLI `--json` output, web result cards, and
Playground tooltips — using consistent wording so a user builds accurate trust in the tool:
`literature-exact` numbers are shown plainly, `interpolated`/`extrapolated` numbers get a `~` prefix
and a one-line "how this was derived" tooltip, and `unsupported` numbers are refused rather
than guessed (the engine returns `null` with a reason string, never a fabricated figure).

### 1.3 Statistical treatment of signature variance

The report gives mean, CV%, and p99 for ML-DSA-44/87 but not a full distribution. To let the
Compare/Playground show a believable spread without inventing precision the data doesn't
support, the engine models signing time as approximately log-normal (a reasonable fit for a
geometric-retry process like rejection sampling) and derives:

```
sigma = ln(1 + CV/100)                 // approx, for CV expressed as %
mu    = ln(meanMs) - sigma^2 / 2
p50   = exp(mu)
p95   = exp(mu + 1.645 * sigma)
p99   = exp(mu + 2.326 * sigma)        // cross-checked against the literature's own p99 anchor
```

The derived `p99` is cross-checked against the literature-reported p99 as a sanity test
(§3.3 of `04-TESTING.md`); if the model and the reported anchor diverge by more than ~15%, the
engine falls back to literal linear interpolation between reported percentiles instead of the
log-normal model, and flags the result as `interpolated` rather than `literature-exact` even for a
reference device, since the shown p95 would otherwise be a model artifact, not a cited figure.

### 1.4 Benchmark metrics catalog (full list the engine can report)

| Metric | Unit | Source methodology | Tier-aware? |
|---|---|---|---|
| Execution time (mean) | ms | #1, #2 | yes |
| Execution time p95 / p99 | ms | #3 | yes |
| Coefficient of variation | % | #3 | yes |
| Peak stack RAM | KB | #5 | yes |
| Flash footprint | KB | #4 | yes |
| Energy per operation | mJ | #6 | yes |
| Key/signature/ciphertext size | bytes | literature tables | n/a (fixed by spec, not benchmarked) |
| Fragment count | count | #8 | derived, deterministic given payload+link |
| Handshake success probability | 0–1 | #8 | derived, deterministic given loss rate |
| MWC verdict | enum | §4.4 of `01-DESIGN.md` | derived |
| Rejection-sampling expected iterations | count | literature (4.25 / 5.1) | fixed by spec |

## 2. Caching layer

### 2.1 Why cache

Individual estimation calls are cheap (pure arithmetic on small JSON tables), so caching is
not primarily a performance necessity for a single calculation — it exists for three other
reasons:

1. **Consistency** — guarantees the exact same inputs always produce the exact same cached
   output within a session, closing the door on any accidental nondeterminism (e.g. floating
   point edge cases) that could otherwise make the Playground's live numbers drift from a
   Simulator-tab number computed moments earlier.
2. **Compare/Playground responsiveness** — the Compare tab (up to 4 combos) and multi-node
   Playground mode recompute on every device swap; caching avoids redundant recomputation when
   a user toggles back and forth between devices they've already selected.
3. **CLI batch workflows** — a CI pipeline running `pqc-iot-sim compare` across many
   device/algorithm pairs in a loop (e.g. a nightly sweep) benefits from not re-deriving
   extrapolations it already computed earlier in the same run.

### 2.2 Cache key design

```
cacheKey = hash({
  deviceId,            // or a normalized fingerprint for a custom device: ram/flash/clock/cpu/dsp
  algoId,
  linkType,            // for network-dependent results
  hops,
  lossRate,
  engineVersion         // bump on any change to extrapolation formulas, invalidates stale caches
})
```

Including `engineVersion` in the key is the key safeguard from `04-TESTING.md` §5's
"a single data file change should propagate everywhere" requirement: it means a cache can
never serve a number computed under an older version of the extrapolation math after that math
changes — the key changes, so it's a guaranteed cache miss, not a stale hit.

### 2.3 Cache layers by surface

| Surface | Cache scope | Storage | Eviction |
|---|---|---|---|
| `core` (shared) | in-process memoization map | plain JS `Map` in memory | cleared on process restart (CLI) or page reload (web); capped at ~500 entries, LRU eviction beyond that — generous enough that a full Compare/Playground session never evicts anything in practice |
| Web app | same in-process cache as `core`, no separate layer | — | — |
| CLI | same in-process cache, plus an optional on-disk result cache for long batch runs | `~/.pqc-iot-sim/cache.json`, keyed the same way | invalidated automatically by `engineVersion`; `--no-cache` flag bypasses entirely for a fresh run |

Explicitly **not cached**: anything involving `Date.now()`/wall-clock timestamps for a run
history entry (§4.3) — those are append-only records, not cacheable computations.

### 2.4 Cache correctness tests (extends `04-TESTING.md`)

| Test | Expectation |
|---|---|
| Call `simulate()` twice with identical inputs | second call returns the memoized object faster, with identical field values (reference equality or deep equality, either is acceptable — correctness, not identity, is what's asserted) |
| Bump `engineVersion`, call `simulate()` with previously-cached inputs | cache misses, recomputes, does not return the old version's numbers |
| CLI `--no-cache` flag | measurably bypasses the on-disk cache (e.g. via a debug log line or timing difference in a test harness) |
| Custom device cache fingerprint | two custom devices with identical ram/flash/clock/cpu/dsp but different names/IDs share a cache entry (fingerprint, not raw ID, is the key) — confirms the cache can't be defeated by renaming a device |

## 3. Alerting layer

### 3.1 Why alerting, not just a badge

The Simulator/Playground already show a Reliable/Marginal/Infeasible badge, but a badge is
easy to miss — especially in a Compare view with several results at once, or in a CLI batch
run with no human watching. The alerting layer makes crossing an important threshold an
**active, unmissable event**, appropriate to each surface.

### 3.2 Alert rules

| Rule | Condition | Severity |
|---|---|---|
| Infeasible configuration | `mwcVerdict === "infeasible"` | Critical |
| Marginal configuration | `mwcVerdict === "marginal"` | Warning |
| High tail-latency risk | signature `p99Ms` exceeds a user-settable RTOS watchdog threshold (default 1000 ms, matching the report's ML-DSA-87 case) | Warning |
| Low handshake reliability | network `successProbability < 0.8` at the configured loss rate | Warning |
| Fragmentation blow-up | `fragmentCount > 20` for a single payload on a constrained link | Info |
| Extrapolation confidence drop | result tier is `extrapolated` or `unsupported` (§1.2) rather than `literature-exact`/`interpolated` | Info |
| Regression vs. last run | (CLI history mode only) a result for the same input is worse than the previous recorded run by more than a configurable % | Warning |

Severities are deliberately reused across surfaces (`critical` / `warning` / `info`) so the
same rule set drives CLI exit codes, web banners, and (optionally) external notifications
consistently.

### 3.3 Alerts per surface

**CLI**
- `critical` → exit code `1`, message printed to stderr in red, machine-readable form also
  included in `--json` output under an `alerts` array.
- `warning` → exit code `0` (doesn't fail a build by default) but printed to stderr; a
  `--strict` flag promotes warnings to exit code `1` for stricter CI gates.
- `info` → printed only in verbose mode (`-v`) or included in `--json`, not shown by default.
- Optional `--webhook <url>` flag: POSTs the `alerts` array as JSON to a webhook (e.g. Slack
  incoming webhook) after a batch run — useful for a nightly sweep across many device/algorithm
  combinations, so a team finds out about a newly-infeasible combo without reading logs.

**Web app**
- `critical` → a dismissible red banner at the top of the result panel, plus the existing red
  node/link styling in the Playground (ties directly into the states table in
  `03-PLAYGROUND.md` §3).
- `warning` → amber inline note directly under the affected metric (e.g. under the p99 figure
  if tail-latency risk fires), not a full banner — keeps it proportionate.
- `info` → small icon with a tooltip, no interruption.
- Compare tab aggregates: if any of the 2–4 compared combos trips a `critical` alert, that
  column's header gets a red outline so it's visible even when scanning across several results.

### 3.4 Alert correctness tests (extends `04-TESTING.md`)

| Test | Expectation |
|---|---|
| CW308-STM32F3 + ML-DSA-87 | fires `infeasible` critical alert; CLI exits 1 |
| RP2040 + ML-DSA-87, default watchdog threshold | fires the tail-latency warning (p99 1,125 ms > 1,000 ms default) even though the mean (355.2 ms) looks fine — this is the test that proves the alert reads `p99Ms`, not just the mean; on an M4 target the p99 is scaled with the estimated mean |
| Loss rate set so `successProbability` computes to exactly 0.79 | fires the low-reliability warning (threshold is `< 0.8`, boundary tested on both sides: 0.80 does not fire, 0.79 does) |
| `--strict` CLI flag with only a warning-level result | exit code becomes `1` instead of `0` |
| Two runs of the same CLI history-mode input, second one slower | fires the regression alert; identical or faster does not |
| Compare tab with one infeasible combo among four | only that one column shows the red outline, the other three remain unaffected |

## 4. Benchmark data governance

### 4.1 Versioning

- `benchmark-data/*.json` carries a top-level `"version"` field, bumped on any anchor-value
  change.
- `core`'s `engineVersion` (used in cache keys, §2.2) is bumped whenever the *formulas* change
  (extrapolation math, MWC thresholds, variance model) — independent of data version, since a
  data correction and a formula change are different kinds of events.
- Both versions are surfaced in the Report tab footer and in `pqc-iot-sim --version`, so any
  exported result can be traced back to exactly which data/engine combination produced it.

### 4.2 Provenance

Every anchor entry keeps its citation number from the source report (e.g. `"source": "report
§5.1, citation 15"`) so the data file doubles as an audit trail — the same citation numbers
used in the Report tab's content (`02-IMPLEMENTATION.md` §6) and the Works Cited list.

### 4.3 Run history (CLI)

Optional but recommended for teams tracking a device's PQC-readiness over time (e.g. as
firmware/compiler toolchains change): `pqc-iot-sim simulate --record` appends a timestamped
entry to `~/.pqc-iot-sim/history.jsonl` (one JSON object per line: inputs, outputs, tier,
engine/data version). `pqc-iot-sim history --device X --algo Y` replays that device/algorithm
pair's recorded results over time, which is what powers the regression alert in §3.2.

## 5. What this file deliberately does not add

- No live telemetry or analytics collection — the simulator is a local/offline tool; "alerting"
  here means surfacing computed results clearly, not phoning anything home.
- No real-time multi-user dashboard — the webhook option in §3.3 is a one-way notification, not
  a shared live state server (keeps the architecture in `02-IMPLEMENTATION.md` §2 intact: no
  new backend).
- No machine-learning-based anomaly detection for the regression alert — it's a simple
  percentage-threshold comparison against the immediately prior recorded run, kept deliberately
  simple and auditable rather than opaque.

## 6. Simplifications still carried over from earlier docs

(Restated here since this file is the natural place a reader double-checks scope.) Clock-scaling
is linear/log-normal approximation, not re-simulation; network loss is modeled as independent
per-fragment; side-channel and hardware-accelerator benchmarking are out of scope entirely.
None of the caching or alerting machinery in this file changes those boundaries — it makes the
*existing* numbers faster to reuse and harder to miss, not more numerous or more precise than
the source literature supports.

## 7. Stretch goals (not required for v1)

- Segment-level flash breakdown (`.text`/`.data`/`.rodata`) instead of one combined figure.
- A richer variance model fit directly to literature percentiles (if more than mean/CV/p99
  become available from future sources) instead of the log-normal approximation in §1.3.
- A shared/team cache or history store (would require the small backend this project currently
  avoids by design).
