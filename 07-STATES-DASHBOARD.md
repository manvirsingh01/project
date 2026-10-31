# PQC-on-IoT Simulator — States Dashboard (All Graphs & Comparisons, One Page)

Companion to `01-DESIGN.md` through `06-DEVICE-CATALOG.md`. Those spread comparison data
across the Simulator, Compare, Network, and Playground tabs. This file defines one more
screen — the **States Dashboard** — that pulls everything into a single page: the full
device×algorithm state matrix, every chart, and the detailed breakdown behind each state, so a
user never has to hop between tabs to get the whole picture.

## 1. Purpose

One page that answers, at a glance and in depth: *across every device I have (reference +
catalog + custom), for every algorithm, what state is it in, why, and how does it compare
visually?* It is the natural landing page for someone who already knows the individual tabs
and now wants the consolidated view — and it's the page the PDF export in
`06-DEVICE-CATALOG.md` §4 is a snapshot of.

It adds no new math. Every number on this page is read from the same `core` functions used
everywhere else (per `02-IMPLEMENTATION.md` §2) — this page is purely a layout/aggregation
layer.

## 2. Page layout

```
┌───────────────────────────────────────────────────────────────────┐
│  States Dashboard                        [Algorithm: All ▾] [Export PDF]│
├───────────────────────────────────────────────────────────────────┤
│  1. Full state matrix (table)                                       │
│     device × algorithm, color-coded Reliable/Marginal/Infeasible    │
├───────────────────────────────────────────────────────────────────┤
│  2. Summary strip                                                    │
│     Reliable: 12   Marginal: 6   Infeasible: 12   (counts, not %)   │
├──────────────────────────────┬────────────────────────────────────┤
│  3. Time comparison chart      │  4. RAM vs. floor chart             │
│     bar per device, grouped     │  bar per device + floor lines      │
│     by algorithm                │  (64 KB / 128 KB)                  │
├──────────────────────────────┼────────────────────────────────────┤
│  5. Energy comparison chart     │  6. Network overhead chart         │
│     bar per device/algorithm    │  fragment count per payload/device  │
├───────────────────────────────────────────────────────────────────┤
│  7. State detail panel (expands on row/cell click)                  │
│     device, algorithm, numbers, binding constraint, confidence tier │
├───────────────────────────────────────────────────────────────────┤
│  8. Signature variance detail (only when a signature algo selected)  │
│     mean / CV% / p95 / p99 bars, per device                         │
└───────────────────────────────────────────────────────────────────┘
```

## 3. Section-by-section detail

### 3.1 Full state matrix (table)

- Exactly the table from `06-DEVICE-CATALOG.md` §2, but **live** — reflects every device
  currently in the catalog, including any the user has added, not a fixed snapshot.
- Rows = devices (sorted by RAM ascending, so the "where does the floor sit" story reads
  top-to-bottom same as §2 there). Columns = algorithms, filterable via the top-right dropdown
  (`All`, `ML-KEM only`, `ML-DSA only`, or a specific variant).
- Each cell: color (Reliable=green / Marginal=amber / Infeasible=red) + the time estimate in
  small text, so the table alone — without opening the detail panel — already carries two
  pieces of information per cell.
- Clicking a cell opens §3.7 (state detail panel) for that exact device/algorithm pair.

### 3.2 Summary strip

- Plain counts, not percentages, so the numbers are stable as devices are added/removed rather
  than looking misleadingly precise.
- Recomputed from the same matrix data, not hand-maintained.

### 3.3 Time comparison chart

- Grouped bar chart: one group per device, one bar per algorithm within the group (or, when
  the algorithm filter is set to a single algorithm, one bar per device — simpler single-series
  view).
- Classical baselines (ECDH P-256, ECDSA P-256) included as reference bars when relevant, so
  the "PQC vs. classical" story from `01-DESIGN.md` §4.2 is visible here too, not only in the
  Compare tab.
- Y-axis log scale available as a toggle — useful because times span 35.7 ms to 1,125 ms+
  across the full device/algorithm set, and a linear axis would flatten the small-device bars
  to invisibility.

### 3.4 RAM vs. floor chart

- One bar per device showing total RAM, with two horizontal reference lines: the 64 KB
  KEM-only floor and the 128 KB full-agility floor (from `01-DESIGN.md` §4.4).
- This is the single chart that most directly visualizes why the low-RAM devices added in
  `06-DEVICE-CATALOG.md` §1 land where they do in the matrix — a bar falling below a line
  explains the infeasible/marginal cells in the same column at a glance.

### 3.5 Energy comparison chart

- Same grouping as §3.3, but energy (mJ) instead of time — surfaces the "ML-KEM is ~17× more
  energy-efficient than ECDH" finding from `01-DESIGN.md` §4.2 visually, device by device.

### 3.6 Network overhead chart

- For the currently selected algorithm (defaults to whichever has the largest payload, usually
  an ML-DSA variant), shows fragment count per device/link combination — ties directly into
  the Network tab math (`02-IMPLEMENTATION.md` §3.4) and the Playground fragment-train
  animation (`03-PLAYGROUND.md` §4), now shown as a static comparative chart rather than a
  per-run animation.

### 3.7 State detail panel

Opens when a matrix cell, or a chart bar, is clicked. Shows, for that one device/algorithm
pair, the full record generated at add-time (per `06-DEVICE-CATALOG.md` §3):

- Identity (device spec) + algorithm identity (family, security level, payload size)
- Confidence tier (measured/interpolated/extrapolated/unsupported) with its one-line
  derivation note
- Time (mean, and p95/p99 if a signature), stack RAM, flash, energy
- MWC state + binding constraint sentence (e.g. *"RAM 8 KB < 64 KB KEM-only floor"*)
- Any active alerts for this pair, pulled directly from `05-BENCHMARKING.md` §3.2's rule table
- A "view in Playground" link that opens the Playground tab pre-loaded with this exact
  device/algorithm pair, so a user can go from the static dashboard to the animated view
  without re-selecting anything

### 3.8 Signature variance detail

- Only rendered when the algorithm filter includes a signature algorithm.
- One row per device showing mean/CV%/p95/p99 as a small horizontal bar-with-whisker, using
  the derivation from `05-BENCHMARKING.md` §1.3 — visually makes clear that a device with an
  acceptable mean (e.g. NUCLEO-L476RG + ML-DSA-87, mean 355.2 ms) can still carry serious
  tail risk (p99 1,125 ms), the same case the alert rule in `05-BENCHMARKING.md` §3.4 tests for.

## 4. Data flow

```
core.getFullMatrix(deviceList, algoList)
        │
        ├─▶ 3.1 matrix table            (direct render)
        ├─▶ 3.2 summary strip           (count by state)
        ├─▶ 3.3 time chart              (pluck timeMs per cell)
        ├─▶ 3.4 RAM chart               (pluck device.ramKB, floors are constants)
        ├─▶ 3.5 energy chart            (pluck energyMJ per cell)
        ├─▶ 3.6 network chart           (core.networkModel per device/algo)
        └─▶ 3.7/3.8 detail panel        (single-cell lookup, already cached per
                                          05-BENCHMARKING.md §2)
```

One function (`core.getFullMatrix`) is the only new piece of logic this page needs — it's a
thin wrapper that calls `core.simulate()` for every device×algorithm pair and shapes the
result into the row/column structure the table and charts both consume, reusing the cache from
`05-BENCHMARKING.md` §2 so generating the whole dashboard doesn't mean dozens of fresh
computations.

## 5. Filtering and scope controls

- Algorithm filter (top right): All / KEM only / Signatures only / a specific variant.
- Device filter: toggle reference boards, catalog low-RAM boards, and custom boards
  independently — useful once the catalog grows past the 10 devices in
  `06-DEVICE-CATALOG.md`.
- "Classical baseline" toggle: show/hide ECDH/ECDSA P-256 reference bars on the charts.
- All filters affect every section simultaneously (matrix, charts, summary strip) — no section
  can be filtered independently, keeping the page internally consistent at all times.

## 6. Export

- "Export PDF" button on this page produces exactly the PDF defined in
  `06-DEVICE-CATALOG.md` §4, using whatever filter state is currently active — so a user can
  narrow to "my 3 custom devices, ML-DSA only" and export just that slice.
- A secondary "Export PNG" option per individual chart (not the whole page) for dropping a
  single chart into a slide deck or report, using the same underlying chart data.

## 7. CLI equivalent

```
pqc-iot-sim states                     # full matrix, text table, all devices/algorithms
pqc-iot-sim states --algo ml-kem       # filtered
pqc-iot-sim states --device-type catalog,custom   # excludes reference boards
pqc-iot-sim states --export pdf --out states.pdf
```

Produces the identical matrix data as the web Dashboard — same `core.getFullMatrix()` call —
so a CI pipeline can assert on the CLI's `--json` output using the exact same expectations a
human would verify by eye on the web page.

## 8. Tests (extends `04-TESTING.md` and `06-DEVICE-CATALOG.md` §4.3)

| Test | Expectation |
|---|---|
| Dashboard matrix vs. standalone Compare-all matrix (`06-DEVICE-CATALOG.md` §2) | identical cell values for the same device/algorithm set — proves this page doesn't maintain a second copy of the logic |
| Adding a device elsewhere (Devices tab) | appears in the Dashboard matrix/charts without a page reload or extra action |
| Clicking a matrix cell | detail panel opens with the exact record generated at add-time (§3.7), no recomputation mismatch |
| Toggling the classical-baseline switch | ECDH/ECDSA bars appear/disappear on time and energy charts only, matrix table unaffected (matrix has no classical rows by design) |
| RAM chart floor lines | fixed at 64 KB and 128 KB regardless of filter state — these are rule constants, not data-dependent |
| CLI `states --json` vs. web Dashboard matrix, same filters | byte-for-byte identical values |
| Export PDF from a filtered view | PDF table only contains the filtered device/algorithm subset, matching what's on screen at export time |

## 9. Milestone addition

Extends `02-IMPLEMENTATION.md` §7 / `06-DEVICE-CATALOG.md` §5:

| Milestone | Scope | Exit criteria |
|---|---|---|
| M8 — States Dashboard | `core.getFullMatrix()`, dashboard page (table + 4 charts + detail panel), CLI `states` command | Matches §8 tests; dashboard and Compare-all/Playground never show conflicting numbers for the same pair |
