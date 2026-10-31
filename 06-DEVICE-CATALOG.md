# PQC-on-IoT Simulator — Extended Device Catalog, State Comparison & PDF Export

Companion to `01-DESIGN.md` through `05-BENCHMARKING.md`. Those cover the five literature
reference boards; this file extends the catalog down into **lower-RAM territory** than the
report's own extreme case (the 40 KB CW308-STM32F3), gives every device a short, scannable
entry, lays out a full **state comparison matrix** across all devices × algorithms, and adds a
**downloadable PDF** (stats table + chart) as an export option.

## 1. Extended device catalog (lower-RAM additions)

The five boards in `01-DESIGN.md` §4.1 bottom out at 40 KB RAM. These additions go lower, to
show exactly where PQC — and even ML-KEM alone — stops being workable. Each entry is kept
short on purpose: one line of spec, one line of verdict.

| ID | Board | CPU | RAM | Flash | Clock | One-line verdict |
|---|---|---|---|---|---|---|
| `stm32l031` | STM32L031 (ultra-low-power) | Cortex-M0+ | 8 KB | 32 KB | 32 MHz | ML-KEM-512 only, marginal; no signing |
| `nrf51822` | nRF51822 (BLE SoC) | Cortex-M0 | 16 KB | 256 KB | 16 MHz | ML-KEM-512 marginal; ML-DSA infeasible |
| `stm32l053` | STM32L053 | Cortex-M0+ | 8 KB | 64 KB | 32 MHz | same tier as stm32l031; RAM is the binding limit |
| `attiny-avr` | ATtiny/ATmega-class (8-bit AVR) | 8-bit AVR | 2 KB | 32 KB | 16 MHz | infeasible — wrong architecture class entirely |
| `msp430fr` | MSP430FR5969 | 16-bit MSP430 | 2 KB | 64 KB | 16 MHz | infeasible — below the 32-bit floor in the MWC rule |
| `cw308-stm32f3` | *(existing reference board)* | Cortex-M4 | 40 KB | 256 KB | — | ML-KEM reliable; ML-DSA infeasible |

Notes on how these were derived (confidence tiers from `05-BENCHMARKING.md` §1.2):

- `stm32l031` / `stm32l053`: **interpolated** — same CPU family (Cortex-M0+, no DSP) as the
  RP2040 anchor, scaled down in clock (32 MHz vs. 133 MHz) and down in RAM. Time estimate
  scales per `02-IMPLEMENTATION.md` §3.1; RAM/stack requirement is copied unscaled, since stack
  usage is a property of the algorithm, not the clock — which is exactly why these boards look
  fine on *time* but fail on *RAM*.
- `nrf51822`: **interpolated**, same reasoning, Cortex-M0 (no DSP, same as M0+ for this purpose).
- `attiny-avr` / `msp430fr`: **unsupported for numeric simulation** — different ISA entirely, no
  anchor to extrapolate from. The catalog marks these `infeasible` by rule (§8.1 of the report:
  8/16-bit architectures push execution into multiple seconds and break network timeouts), not
  by computed time/energy. The CLI and web UI must show "infeasible — architecture class
  excluded" rather than inventing a number for them.

### 1.1 Why include architecturally-excluded devices at all

So a user comparing "my tiny 8-bit sensor" against the simulator gets an honest, immediate
answer — infeasible, with the reason stated — instead of either silently omitting the device
or (worse) fabricating a plausible-looking but baseless time/energy figure for an architecture
the literature never benchmarked.

## 2. Full state comparison matrix

"State" = the MWC verdict (`reliable` / `marginal` / `infeasible`) from `01-DESIGN.md` §4.4,
evaluated per device × per algorithm requirement. This is the single table meant to answer
"which of my devices can do what" at a glance — in the web app it's the **Compare-all** view;
in the CLI it's `pqc-iot-sim matrix`.

| Device (RAM) | ML-KEM-512 (KEM only, ≥64 KB floor) | ML-KEM + ML-DSA-44 (full agility, ≥128 KB floor) | ML-DSA-87 (heaviest, 119.6 KB stack) |
|---|---|---|---|
| `msp430fr` (2 KB) | infeasible | infeasible | infeasible |
| `attiny-avr` (2 KB) | infeasible | infeasible | infeasible |
| `stm32l031` (8 KB) | infeasible | infeasible | infeasible |
| `stm32l053` (8 KB) | infeasible | infeasible | infeasible |
| `nrf51822` (16 KB) | infeasible | infeasible | infeasible |
| `cw308-stm32f3` (40 KB) | marginal | infeasible | infeasible |
| `nucleo-l476rg` (128 KB) | reliable | reliable | marginal |
| `stm32f4-disco` (192 KB) | reliable | reliable | reliable |
| `rp2040` (264 KB) | reliable | reliable | reliable |
| `nucleo-l4r5zi` (640 KB) | reliable | reliable | reliable |

Reading this table top to bottom is itself the clearest statement of the project's core
finding: the floor for **any** PQC is roughly in the 16–40 KB RAM range (and even then only for
ML-KEM, not signing), and the floor for **full agility** (KEM + signing) sits around 128 KB —
exactly matching the report's §8 conclusion.

### 2.1 State definitions, restated in full

| State | Meaning | What crosses a device into this state |
|---|---|---|
| **Reliable** | Device comfortably exceeds the RAM/flash/clock floor for the requested algorithm(s) | RAM ≥ required floor, flash ≥ 512 KB, 32-bit CPU ≥ 48 MHz |
| **Marginal** | Device is within ~20% of a floor, or meets RAM but misses the flash floor (or vice versa) | e.g. `cw308-stm32f3` at 40 KB sits below the 64 KB KEM-only floor but close enough, on a CPU family with DSP support, that `marginal` rather than an outright `infeasible` is the fairer call for ML-KEM alone |
| **Infeasible** | Device misses a floor by more than the marginal band, or belongs to an excluded architecture class (8/16-bit) entirely | `attiny-avr`, `msp430fr`, and every device below the ~16 KB practical RAM floor for KEM-only operation |

## 3. Per-add-device detail flow (what happens each time a device is added)

Every time a device — reference, catalog addition, or user-custom — is added to the system,
the following detail is generated and attached to it, so the "short" one-line catalog entry in
§1 always has a full record behind it:

1. **Identity** — id, name, CPU family, RAM, flash, clock, DSP flag, radio type.
2. **Confidence tier** — measured / interpolated / extrapolated / unsupported (§1.2 of
   `05-BENCHMARKING.md`), assigned automatically based on how close the device sits to an
   existing anchor.
3. **Per-algorithm row** — for every supported algorithm (ML-KEM-512/768/1024, ML-DSA-44/65/87),
   computed time, stack, energy, and MWC state — i.e. one full row of the matrix in §2 is
   generated the moment a device is added, not computed lazily only when a user clicks it.
4. **Binding constraint** — a short, explicit reason attached to any non-`reliable` state (e.g.
   *"RAM 8 KB < 64 KB KEM-only floor"* or *"architecture class excluded — 16-bit MSP430"*),
   reused directly as the alert message from `05-BENCHMARKING.md` §3.2.
5. **Cache entry** — immediately memoized per `05-BENCHMARKING.md` §2, so the matrix table
   (§2 above) never has to recompute a row that was already generated at add-time.

This means the Devices tab, the Playground node dropdown, the Compare-all matrix, and the CLI
`devices add` command all share one generation step — add once, every other screen reflects it
instantly and consistently.

## 4. PDF export of the stats table and graph

### 4.1 What gets exported

A single PDF, generated on demand from the **current** state comparison matrix (§2) — whatever
set of devices and algorithms the user currently has selected/added, not a fixed hardcoded
set — containing:

1. **Cover section** — title, generation timestamp, data/engine version (per
   `05-BENCHMARKING.md` §4.1), so an exported PDF is traceable to exactly which benchmark data
   produced it.
2. **Stats table** — the full matrix from §2, rendered as a real table (not a screenshot),
   with each cell colored to match the Reliable/Marginal/Infeasible states used on screen.
3. **Bar/column graph** — one chart comparing execution time (or energy, user-selectable before
   export) across all included devices for a chosen algorithm, plus a second chart for the
   RAM-floor comparison (each device's RAM as a bar, with the KEM-only and full-agility floors
   drawn as horizontal reference lines) — this is the chart that visually reproduces §2's
   "where does the floor sit" finding.
4. **Footnotes** — citation numbers for every anchor value used, pulled directly from
   `benchmark-data/algorithms.json`'s `source` fields (per `05-BENCHMARKING.md` §4.2), so the
   PDF is self-citing and doesn't need the original report attached to be checked.

### 4.2 Where this lives in the system

- **Web app**: a "Download PDF" button on the Compare-all / matrix view. Triggers a server-free,
  in-browser PDF generation (e.g. drawing the table and chart to canvas/SVG and encoding as
  PDF client-side) — consistent with the project's no-backend design in `02-IMPLEMENTATION.md`
  §2.
- **CLI**: `pqc-iot-sim matrix --export pdf --out devices-report.pdf`, using the same
  table/chart-generation logic as the web button, invoked headlessly — this is the one CLI
  command that produces a binary artifact rather than text/JSON/CSV.
- Both paths call the same `core` matrix-generation function from §3 and the same chart-data
  shaping logic, so the web PDF and the CLI PDF are guaranteed to show identical numbers.

### 4.3 PDF content tests (extends `04-TESTING.md`)

| Test | Expectation |
|---|---|
| Export PDF with default device/algorithm selection | table row count matches the number of devices currently in the catalog (reference + added), not a hardcoded 5 |
| Add a new low-RAM device, re-export | new device appears as a new row in the next PDF without any code change |
| Table cell colors | match the on-screen Reliable/Marginal/Infeasible colors exactly (same CSS/verdict mapping reused, not redefined for print) |
| Chart bar values | match the corresponding matrix cell's numeric value exactly — spot-checked the same way as the Compare-tab test in `04-TESTING.md` §4.2 |
| Footnote citation numbers | every anchor value shown in the table has a matching footnote, and every footnote number matches `benchmark-data/algorithms.json`'s `source` field |
| CLI and web PDF for the identical device/algorithm selection | byte-for-byte identical table contents (chart rendering may differ cosmetically, but the underlying data must match) |

## 5. Updated milestone addition

Extends the milestone table in `02-IMPLEMENTATION.md` §7:

| Milestone | Scope | Exit criteria |
|---|---|---|
| M6 — Extended device catalog | Add the §1 low-RAM devices to `benchmark-data/devices.json`, generate full per-algorithm rows per §3 | `devices list` / Devices tab shows 10 total devices (5 original + 5 new), each with a correct state in the matrix |
| M7 — Matrix & PDF export | Compare-all matrix view (web) + `pqc-iot-sim matrix` (CLI), PDF export on both | Matrix table matches §2 exactly; PDF export passes all tests in §4.3 |
