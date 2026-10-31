# PQC-on-IoT Simulator — Implementation Plan

Companion to `01-DESIGN.md`. That file defines *what* the system is; this file defines
*how to build it* — stack, folder layout, build order, and the report content outline.

## 1. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Shared estimation core | TypeScript, zero dependencies | Pure functions, runs identically in Node (CLI) and browser (web) |
| Web app | Single self-contained HTML file (vanilla JS/TS compiled in, or React via pinned UMD scripts) | Matches a portable, dependency-light deployment; no build server required to view it |
| Charts (variance, comparisons) | Lightweight inline SVG or Chart.js (UMD) | Visualizes mean/CV/p95/p99 and comparison bars |
| CLI | Node.js, no external framework; `process.argv` parsing or a minimal arg parser | Keeps the CLI a thin wrapper over the same core — one `npm` dependency at most |
| Data tables | JSON files under `benchmark-data/`, imported by the core | Keeps literature numbers out of logic code; easy to audit/update/cite |
| Storage (web, custom devices) | In-memory + optional `localStorage` (per-browser convenience only) | Custom devices are a convenience, not shared state |
| Tests | Lightweight assertion scripts against the core's pure functions | Confirms CLI and web never diverge, since both call the same functions |

## 2. Repository layout

```
pqc-iot-sim/
├── 01-DESIGN.md
├── 02-IMPLEMENTATION.md
├── benchmark-data/
│   ├── devices.json          # the 5 reference boards, §4.1
│   ├── algorithms.json       # ML-KEM/ML-DSA/SLH-DSA/LMS anchors, §4.2
│   └── network.json          # 802.15.4/6LoWPAN constants, §4.3
├── core/
│   ├── deviceModel.ts        # scale/extrapolate custom device profiles
│   ├── algoModel.ts          # time/stack/energy estimation per device+algo
│   ├── networkModel.ts       # fragmentation + success-probability math
│   ├── mwcRules.ts           # reliable/marginal/infeasible classifier
│   └── index.ts              # public API surface used by both front ends
├── cli/
│   └── pqc-iot-sim.js        # argv parsing → core calls → table/json/csv output
├── web/
│   └── index.html            # single-file simulator + report page
└── tests/
    └── core.test.ts
```

## 3. Core estimation logic (the part both front ends share)

### 3.1 Reference lookup vs. extrapolation

- If `deviceId` matches one of the 5 reference boards **and** the algorithm has a published
  anchor for that exact board/CPU family → return the literature number directly, tagged
  `isExtrapolated: false`.
- Otherwise (custom device, or a reference board without a direct anchor for that algorithm) →
  extrapolate from the nearest anchor of the same CPU family using:
  - **Time scaling**: `anchorTime × (anchorClockMHz / targetClockMHz) × dspFactor`, where
    `dspFactor` is 1.0 for Cortex-M4 (has DSP) and ~1.85 when scaling from an M4 anchor down to
    an M0+ target (or its inverse going the other way), taken from the "1.8×–1.9× slowdown"
    figure in the report.
  - **Stack RAM**: treated as architecture-independent (same algorithm, same working-set size)
    — copied from the nearest anchor, not scaled by clock.
  - **Energy**: `anchorEnergy × (estimatedTime / anchorTime)` — energy scales with time at a
    fixed active-mode current draw (consistent with the report's `Energy = Power × Time` note).
  - Result tagged `isExtrapolated: true` and shown in the UI/CLI with a visible "estimated"
    label — never presented as equal-confidence to a literature-sourced figure.

### 3.2 Signature variance (rejection sampling)

For ML-DSA family, report four numbers per result, not just a mean:
- mean signing time (anchor or scaled)
- CV% (coefficient of variation) — copied from the nearest anchor, since CV is a property of
  the rejection-sampling distribution, not the clock speed
- p99 estimate: `mean × (anchor_p99 / anchor_mean)` — preserves the anchor's tail-to-mean ratio
  under scaling
- expected rejection iterations (4.25 for ML-DSA-44, 5.1 for ML-DSA-65) shown as context

### 3.3 MWC classification

```
function classify(device, requiredAlgos):
  if device.cpu == "custom-8bit" or clockMHz < 48: return "infeasible"
  needsSigning = requiredAlgos.some(a => a.family == "signature")
  ramNeeded = needsSigning ? 128 : 64
  if device.ramKB < ramNeeded * 0.8: return "infeasible"
  if device.ramKB < ramNeeded: return "marginal"
  if device.flashKB < 512: return "marginal"
  return "reliable"
```

### 3.4 Network fragmentation

```
function fragment(payloadBytes, link, hops):
  perFrame = link == "802.15.4" ? (hops > 1 ? 45 : 81) : loraPayloadConstant
  fragmentCount = ceil(payloadBytes / perFrame)
  successProbability = (1 - lossRate) ** fragmentCount
  return { fragmentCount, successProbability, perFrame }
```

## 4. Web app build plan

1. **Shell & theme** — single HTML file, light/dark aware (per the house CSS-variable pattern),
   tab-based navigation: Devices · Simulator · Compare · Network · Report.
2. **Devices tab** — render `devices.json` as cards; "Add custom device" form (name, CPU,
   RAM, flash, clock, radio) saved to in-memory state (+ optional `localStorage`, wrapped in
   try/catch, never relied on for shared/critical state).
3. **Simulator tab** — two dropdowns (device, algorithm/security level) → call
   `core.simulate()` → render result card (time, stack, flash headroom bar, energy, MWC badge).
   For signature algorithms, render the mean/CV/p95/p99 as a small bar or box plot.
4. **Compare tab** — multi-select up to 4 device/algorithm pairs → bar chart comparing time,
   stack, and energy side by side; classical baseline (ECDH/ECDSA P-256) selectable for
   contrast, reproducing the report's "17× faster / 17× more efficient" style comparison.
5. **Network tab** — payload size (auto-filled from a chosen algorithm's key/signature size, or
   manual entry), link type, hop count, loss-rate slider → fragment count + success-probability
   output, with the "one lost fragment drops the whole datagram" rule made explicit in copy.
6. **Report tab** — static, literature-grounded content (outline in §6 below), each claim tagged
   with its source number so the page is auditable against the original report.
7. **Export** — "Download CSV/JSON" button serializing the current Compare-tab selection.

## 5. CLI build plan

1. Thin argv router (`devices`, `simulate`, `network`, `compare`, `report`, `export`
   subcommands) calling the same `core/index.ts` functions used by the web app.
2. Default output: aligned text table. `--json` / `--csv` flags switch formatter.
3. `devices add` writes a new entry to a local `~/.pqc-iot-sim/custom-devices.json` so custom
   boards persist across CLI runs (distinct from the web app's browser-local storage — no
   shared backend in v1).
4. `report --format md` renders the same content as the web Report tab, for use in CI logs or
   piping into other docs.
5. Exit codes: 0 reliable/marginal, 1 infeasible, 2 bad input — useful for scripting
   "fail the build if this device/algorithm combo is infeasible."

## 6. Report-page / literature content outline

The in-app Report tab (and `report` CLI command) should cover, in this order, mirroring the
structure of the source research report:

1. **Why this matters** — harvest-now-decrypt-later threat model; NIST FIPS 203/204/205/206.
2. **The core bottleneck** — polynomial multiplication, NTT, twiddle-factor storage trade-off.
3. **Ten benchmarking methodologies** — one line each: cycle-accurate profiling, zero
   wait-state execution, statistical variance analysis, static flash tracking, dynamic stack
   instrumentation, empirical energy modeling, cross-architecture KAT verification, network
   fragmentation simulation, side-channel characterization, hardware/software co-design ATP.
4. **Five reference device profiles** — the table from DESIGN §4.1, with the "why this board
   matters" one-liner each.
5. **ML-KEM findings** — M0+ vs M4 divergence (DSP/SIMD, UMULL/SMULL), the headline
   35.7 ms / 2.83 mJ figure, and the ~17× efficiency gain over ECDH P-256.
6. **ML-DSA findings** — rejection sampling and Fiat-Shamir-with-Aborts, the CV%/p99 numbers,
   and why that variance matters for RTOS watchdog timers.
7. **Network bottleneck** — 802.15.4's 127-byte MTU, 6LoWPAN fragmentation math, VRB buffer
   overflow risk, and the "bottleneck shifts from CPU to radio" conclusion.
8. **Firmware verification** — why ML-DSA/SLH-DSA are too large for OTA signature delivery,
   and why stateful LMS/XMSS (RFC 8554 / RFC 8391) is the practical choice for a verifier-only
   embedded device.
9. **Minimum Workable Configuration** — the §8 thresholds, presented as the same rule the
   Simulator tab evaluates against, so the report and the tool agree.
10. **Citations** — numbered list matching the "Works cited" section of the source report, so
    every claim above can be traced back to its source.

## 7. Milestones

| Milestone | Scope | Exit criteria |
|---|---|---|
| M0 — Data layer | `benchmark-data/*.json` populated from DESIGN §4.1–4.3 | Every anchor figure has a `source` citation field |
| M1 — Core engine | `core/` pure functions + unit tests | CLI and web produce identical numbers for the same inputs |
| M2 — CLI v1 | `devices`, `simulate`, `network` subcommands, table + JSON output | Can run `simulate --device rp2040 --algo ml-kem-512` end to end |
| M3 — Web v1 | Devices + Simulator tabs only | Can pick device/algo in browser and see a result card |
| M4 — Web v2 | Compare + Network + Report tabs, custom device form | Full tab set functional, report content complete |
| M5 — Export & polish | CSV/JSON export, CLI `report`, dark-mode pass, README | Both front ends feature-complete and consistent |

## 8. Known simplifications to disclose in the UI/CLI help text

- Energy/time scaling across devices is a linear approximation, not a cycle-accurate
  re-simulation (no QEMU/pqriscv integration in v1).
- Network loss model assumes independent per-fragment loss; real RF channels are often
  bursty/correlated, so this is a conservative-ish approximation, not a guarantee.
- Side-channel resistance (§3.9 of the report) is not modeled quantitatively — only referenced
  in the Report tab as a qualitative consideration.
- Custom/extrapolated device results are always labeled `isExtrapolated: true` and should be
  treated as estimates, not measured data.

## 9. Suggested next step

Once this plan is approved, the next concrete artifact to build is **M2 (CLI v1)** or
**M3 (Web v1)** — whichever you want first. Say the word and I'll scaffold the actual code
(core engine + data files + one working front end) as a follow-up.
