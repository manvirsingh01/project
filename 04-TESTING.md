# PQC-on-IoT Simulator — Testing Plan

Companion to `01-DESIGN.md`, `02-IMPLEMENTATION.md`, and `03-PLAYGROUND.md`. Those define
what the system is, how to build it, and the animated playground screen. This file defines
**how to prove it actually works** — what to test, what each test should expect, and how to
confirm the web app, the CLI, and the Playground animation are all genuinely driven by the
same underlying logic rather than faking it.

## 1. Testing philosophy

Three layers, each catching a different class of bug:

1. **Data correctness** — does `benchmark-data/*.json` match the source documents exactly?
2. **Engine correctness** — does `core/` turn that data into the right numbers for both
   reference boards (exact lookup) and custom devices (extrapolation)?
3. **Surface correctness** — do the CLI, the web tabs, and the Playground animation all
   display what the engine actually computed — not a hardcoded placeholder, not a stale
   value, not something invented for visual effect?

A result is only trustworthy if all three layers pass. A pretty Playground animation that
plays regardless of the chosen device is a failure at layer 3 even if layers 1–2 are fine —
so several tests below exist specifically to catch "looks right but isn't wired up."

## 2. Layer 1 — Data correctness tests

Goal: catch typos/transcription errors between the source report and `benchmark-data/*.json`.

| Test | Expectation |
|---|---|
| `devices.json` has exactly 5 `isReference: true` entries | matches §4.1 of `01-DESIGN.md`: cw308-stm32f3, nucleo-l476rg, stm32f4-disco, rp2040, nucleo-l4r5zi |
| Each reference device's RAM/flash/clock matches the source table | e.g. `rp2040.ramKB === 264`, `flashKB === 2048`, `clockMHz === 133` |
| Every entry in `algorithms.json` has a non-empty `source` citation | fails the build if any anchor number is uncited |
| ML-KEM-512 anchor on M0+ | `timeMs === 35.7`, `stackKB === 9.4`, `energyMJ === 2.83` |
| ML-KEM-768 anchor on M0+ | `timeMs === 56.6`, `stackKB === 14.2`, `energyMJ === 4.48` |
| ML-KEM-1024 anchor on M0+ | `timeMs === 85.7` |
| ECDH P-256 classical baseline | `timeMs === 606.0`, `energyMJ === 48.9` |
| ML-DSA-44 anchor | mean `158.9`, `cvPercent === 67.5`, `p99Ms === 489.9`, `stackKB === 50.6` |
| ML-DSA-65 anchor | mean `256.6`, `stackKB === 77.6` |
| ML-DSA-87 anchor | mean `355.2`, `p99Ms === 1125.0`, `stackKB === 119.6` |
| SLH-DSA-128s signature size | `payloadBytes === 7856` |
| LMS H25 signature size | `payloadBytes === 1116` |
| ML-DSA-44 signature size | `payloadBytes === 2420` |
| Network constants | MTU `127`, single-hop payload `81`, multi-hop payload `45` |
| MWC thresholds in `mwcRules.ts` match §4.4 | KEM-only RAM floor `64`, full-agility RAM floor `128`, flash floor `512` |

Run as a script (`npm run test:data`) that diffs the JSON against a small "expected anchors"
fixture, not by eyeballing — this is the layer most likely to silently drift when someone
"quickly edits a number."

## 3. Layer 2 — Engine (core) correctness tests

### 3.1 Exact-anchor lookups

For every `(reference device, algorithm)` pair that has a direct literature anchor, confirm
`core.simulate()` returns the anchor value **exactly**, with `isExtrapolated: false`.

```
simulate(device: rp2040, algo: ml-kem-512)
  expect estimatedTimeMs === 35.7
  expect estimatedStackKB === 9.4
  expect estimatedEnergyMJ === 2.83
  expect isExtrapolated === false
  expect mwcVerdict === "reliable"
```

### 3.2 Extrapolation math

For a device/algorithm pair with **no** direct anchor (e.g. a custom 96 KB / 64 MHz Cortex-M0+
board, or ML-KEM-512 on the Cortex-M4 STM32F4 Discovery where the literature anchor is on
M0+), confirm the scaling formulas from `02-IMPLEMENTATION.md` §3.1 are applied, not copied:

| Test | Expectation |
|---|---|
| Same CPU family, different clock | time scales inversely with clock ratio, stack unchanged, energy scales with time |
| M0+ anchor → M4 target | time divided by ~1.8–1.9 (DSP factor), not equal to the M0+ anchor |
| M4 anchor → M0+ target | time multiplied by ~1.8–1.9 |
| Any extrapolated result | `isExtrapolated === true` always set — never silently returned as if measured |
| Device below 48 MHz or non-32-bit | `mwcVerdict === "infeasible"` regardless of RAM/flash |

### 3.3 Signature variance math

| Test | Expectation |
|---|---|
| ML-DSA-44 p99/mean ratio preserved under scaling | scaled p99 ÷ scaled mean ≈ 489.9 ÷ 158.9 (within rounding) |
| CV% is copied, not recalculated from scratch | CV% identical before/after clock-scaling (CV is a distributional property, not a clock property, per `02-IMPLEMENTATION.md` §3.2) |
| Rejection-iteration count shown matches algorithm | ML-DSA-44 → 4.25, ML-DSA-65 → 5.1 |

### 3.4 MWC classification

| Scenario | Expected verdict |
|---|---|
| CW308-STM32F3 (40 KB RAM) + ML-DSA-44 (needs 128 KB floor) | `infeasible` |
| CW308-STM32F3 + ML-KEM-512 only (needs 64 KB floor) | `infeasible` (40 KB < 64 KB floor, even KEM-only) |
| NUCLEO-L476RG (128 KB RAM) + ML-KEM + ML-DSA | `reliable` (meets 128 KB full-agility floor exactly) |
| Custom device at 104 KB RAM + full agility requirement | `marginal` (below 128 KB floor but within 80% band; 100 KB is below 80% and is infeasible) |
| Custom device at 500 KB RAM, 256 KB flash | `marginal` (RAM fine, flash below 512 KB floor) |
| NUCLEO-L4R5ZI (640 KB RAM, 2 MB flash) + ML-DSA-87 | `reliable` |

### 3.5 Network / fragmentation math

| Test | Expectation |
|---|---|
| ML-DSA-44 signature (2,420 B) over single-hop 802.15.4 | `fragmentCount === ceil(2420/81) === 30` |
| Same signature, multi-hop (2 hops) | `fragmentCount === ceil(2420/45) === 54`, confirming hop count visibly raises fragment count |
| ML-KEM-512 public key (800 B) single-hop | `fragmentCount === ceil(800/81) === 10` |
| Success probability at 0% loss | `successProbability === 1.0` for any fragment count |
| Success probability at 2% loss, 30 fragments | `successProbability === (0.98)^30 ≈ 0.545`, confirming the exponential-decay relationship, not a linear one |
| Success probability at 2% loss, 54 fragments (multi-hop case above) | strictly lower than the 30-fragment case — proves the engine, not just the UI copy, treats multi-hop as worse |

### 3.6 Consistency invariant (the most important single test)

Run the **same** `(device, algorithm, link, hops, loss)` input through:
1. `core.simulate()` called directly (unit test),
2. the CLI's `simulate`/`network` commands with `--json` output,
3. the web app's Simulator/Network tab result state (via a headless browser test).

All three must return bit-identical numbers. This is the test that proves the "shared core"
architecture in `02-IMPLEMENTATION.md` §2 is real and not three separately-coded copies that
happen to agree today and drift tomorrow.

## 4. Layer 3 — Surface (CLI / web / Playground) tests

### 4.1 CLI

| Test | Expectation |
|---|---|
| `pqc-iot-sim devices list` | prints all 5 reference devices + any custom ones added in this session/profile store |
| `pqc-iot-sim devices add --name x --ram 96 --flash 512 --clock 64 --cpu cortex-m0+` then `devices list` | new device appears, persisted in `~/.pqc-iot-sim/custom-devices.json` |
| `pqc-iot-sim simulate --device rp2040 --algo ml-kem-512` | matches §3.1 anchor exactly |
| `pqc-iot-sim simulate --device cw308-stm32f3 --algo ml-dsa-44` | exits with code `1` (infeasible), per §5 of `02-IMPLEMENTATION.md` |
| `pqc-iot-sim simulate --device bogus-id --algo ml-kem-512` | exits with code `2` (bad input), clear error message, no stack trace dump |
| `--json` flag | output is valid JSON parseable by `JSON.parse`, same field names as `SimulationResult` in `01-DESIGN.md` §8 |
| `--csv` flag | output has a header row plus one row per result, opens cleanly in a spreadsheet |
| `pqc-iot-sim report --format md` | output is valid Markdown, contains all 10 section headers from `02-IMPLEMENTATION.md` §6 |

### 4.2 Web app

| Test | Expectation |
|---|---|
| Load app with no network access (offline) | loads and functions fully — everything is self-contained, no external fetch required for core simulation |
| Devices tab | all 5 reference boards render with correct RAM/flash/clock text matching `devices.json` |
| Add custom device via form | appears immediately in both the Devices tab list and the Simulator/Playground device dropdowns |
| Simulator tab, pick rp2040 + ml-kem-512 | displayed numbers match §3.1 exactly (manually cross-check against the result panel's DOM text, not just "looks right") |
| Simulator tab, pick an infeasible combo | verdict badge shows red/"Infeasible" and names which resource is short (RAM or flash), not a generic failure message |
| Compare tab, select 3 combos including one classical baseline | bar chart renders 3 bars per metric, values match individually-run Simulator results for the same inputs |
| Network tab | fragment count and success probability match §3.5 table for the same inputs |
| Report tab | every numeric claim in the rendered text matches its corresponding entry in `benchmark-data/`, spot-checked against `01-DESIGN.md` §4 |
| Light/dark mode toggle (OS-level) | all result badges and charts remain legible in both modes |
| `prefers-reduced-motion` enabled | Playground skips travel animation, jumps straight to result state (per `03-PLAYGROUND.md` §4) |

### 4.3 Playground — proving the animation is real, not decorative

This is the layer most prone to "looks like it's simulating something" without actually being
wired to live data. Tests here specifically try to catch that:

| Test | Expectation |
|---|---|
| Swap Node A from RP2040 to NUCLEO-L4R5ZI, rerun | result strip numbers change, animation duration changes (per the `displayMs` formula in `03-PLAYGROUND.md` §4), link color/dash pattern updates if verdict changes |
| Pick ML-DSA-44 vs ML-DSA-87 | number of rejection-sampling pulses shown differs (≈4 vs ≈5), not a fixed animation reused for both |
| Pick ML-KEM-512 vs an ML-DSA signature over 802.15.4 | KEM shows a single packet pass; ML-DSA-44 shows a fragment train of **30** pieces (single hop) — count the rendered fragment elements in the DOM/SVG and assert it equals the engine's `fragmentCount`, not an approximate or capped visual count |
| Add a relay node (multi-hop mode) | fragment train visibly grows from 30 to 54 pieces for the same ML-DSA-44 signature, matching §3.5's multi-hop test |
| Set loss rate high enough that `successProbability < 0.5` | animation shows at least one dropped-fragment + retry pass; set loss to 0% and confirm no drop animation ever plays |
| Swap a device mid-animation | in-flight animation cancels cleanly (no leftover DOM nodes/timers — check via a "no orphaned `.packet` elements after 3 seconds" assertion), state resets to Idle |
| Infeasible combo (CW308-STM32F3 + ML-DSA-87) | node shakes, link shows broken style, Run button either disabled or clearly labeled as a "why" preview rather than playing a normal success animation |

## 5. Cross-cutting / regression tests

| Test | Expectation |
|---|---|
| Change a single number in `benchmark-data/algorithms.json` | that single change propagates to CLI output, web Simulator, Compare chart, and Playground animation timing — without touching any other file (proves no hardcoded duplicate values exist anywhere) |
| Add a 6th reference-style device to `devices.json` | appears automatically in Devices tab, Simulator/Playground dropdowns, and `devices list` CLI output with zero code changes |
| Run full test suite (`npm test`) after any `core/` change | Layer 1 + Layer 2 + the CLI/web/Playground consistency checks in §3.6 and §4.3 all run in one command, so a regression can't ship silently |

## 6. Manual acceptance checklist (before calling a milestone "done")

- [ ] Every number in the Report tab can be traced to `01-DESIGN.md` §4 or the original PDFs.
- [ ] Every Simulator/Compare/Network result for a reference device+algorithm pair matches the
      literature anchor exactly — no silent rounding drift.
- [ ] Every extrapolated (custom-device) result is visibly labeled as estimated in both the CLI
      (`~` prefix or `"extrapolated": true` in JSON) and the web UI (badge/tooltip).
- [ ] The Playground never plays an animation whose duration, pulse count, or fragment count is
      independent of the currently selected device/algorithm/link — spot-check at least one
      KEM case, one signature case, and one network-fragmented case per §4.3.
- [ ] CLI exit codes are correct for reliable/marginal/infeasible/bad-input, so it's safe to use
      in a CI gate.
- [ ] App functions fully offline (no external network calls required for core simulation
      features — only optional, explicitly-labeled "export/share" actions may need network).

## 7. Suggested test tooling

- Layer 1 (data): a small Node script run via `npm run test:data`, exits non-zero on mismatch.
- Layer 2 (engine): plain assertion-based unit tests in `tests/core.test.ts`, no heavy test
  framework required — `node --test` or a minimal assertion runner is enough given the engine
  is pure functions with no I/O.
- Layer 3 (CLI): shell-script smoke tests invoking the built CLI and checking stdout/exit code.
- Layer 3 (web/Playground): a lightweight headless-browser script (e.g. driving the single HTML
  file) for the DOM-count assertions in §4.3 — these are the only tests that need a browser
  environment; everything else runs in plain Node.
