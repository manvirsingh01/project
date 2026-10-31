# PQC-on-IoT Simulator — Raw Data Export (Single File) & Numbers-Only PDF

Companion to `01-DESIGN.md` through `08-REFERENCES.md`. Those cover the visual dashboard and a
narrative PDF (table + chart + footnotes). This file defines two additional, simpler exports:
a **single raw data file** (every device × every algorithm, numbers only, no charts or prose)
and a **numbers-only PDF** of the same data — plus extends the algorithm coverage to all three
parameter sets of both ML-KEM and ML-DSA, broken down by cryptographic operation phase
(key generation, encapsulation/decapsulation for KEM; key generation, signing, verification for
signatures).

## 1. Why a separate export from the PDF in `06-DEVICE-CATALOG.md`

That PDF is a **report** — table, charts, footnotes, meant to be read. This export is a
**dataset** — meant to be loaded into a spreadsheet, a notebook, or another tool. Different use
case, so it gets its own, much simpler format: one table, numbers and labels only, nothing
else.

## 2. Single downloadable data file

### 2.1 Format

CSV by default (opens everywhere, loads into any spreadsheet or analysis tool without a
parser); JSON available as an alternate format for programmatic use. One file, one flat table —
no multi-sheet workbook, no nested structure in the CSV case.

### 2.2 Row structure — one row per (device, algorithm, operation)

This is the key extension this file adds: instead of one row per device/algorithm pair with a
single combined time, each row is scoped to a **specific operation phase**, so key generation,
encapsulation, and decapsulation (for ML-KEM) — or key generation, signing, and verification
(for ML-DSA) — are separate, individually inspectable rows.

```
device_id, device_cpu, device_ram_kb, device_flash_kb, device_clock_mhz,
algo_id, algo_family, security_level,
operation,              // keygen | encapsulate | decapsulate | sign | verify | full_handshake
time_ms,
stack_kb,
energy_mj,
payload_bytes,
cv_percent,              // sign operation only
p99_ms,                  // sign operation only
mwc_verdict,
confidence_tier,
source_citation
```

### 2.3 Operation-level coverage — all three parameter sets, both families

| Algorithm family | Parameter sets | Operations tracked |
|---|---|---|
| ML-KEM | 512, 768, 1024 | `keygen`, `encapsulate`, `decapsulate`, and `full_handshake` (sum of the three, matching the literature's reported combined figure) |
| ML-DSA | 44, 65, 87 | `keygen`, `sign`, `verify` |

### 2.4 Honest handling of what the literature actually measured

The source report publishes **combined** figures — "full handshake" for ML-KEM (keygen +
encapsulate + decapsulate together) and a single signing mean for ML-DSA — not a per-operation
split. Rather than inventing a plausible-looking split, this export follows the project's
existing rule (already used throughout `benchmark-data/*.json`: *"null means the source did
not provide a numeric anchor; it is intentionally not replaced with a guess"*):

- `full_handshake` rows for ML-KEM-512/768/1024: populated directly from the literature anchors
  (35.7 / 56.6 / 85.7 ms), `confidence_tier = measured`.
- `keygen` / `encapsulate` / `decapsulate` sub-rows for ML-KEM: `time_ms = null`,
  `confidence_tier = unsupported`, with a note field explaining *"source reports only the
  combined handshake time; no per-phase split is published."* The row still exists — with
  device, algorithm, and operation clearly labeled — so the schema is ready the moment a future
  source does publish a split, without a breaking schema change.
- `sign` rows for ML-DSA-44/65/87: populated from the literature anchors (158.9 / 256.6 /
  355.2 ms mean, plus `cv_percent` and `p99_ms` where published).
- `verify` rows for ML-DSA: literature notes verification is fast and hash-based-comparable
  (no NTT-heavy rejection sampling on the verifier side), but no numeric anchor is given in the
  source report → `time_ms = null`, `confidence_tier = unsupported`, same "no published figure"
  note.
- `keygen` rows for ML-DSA: same treatment — no published per-phase figure, `null` with a note.

This keeps the export truthful: a spreadsheet user filtering to `operation = keygen` sees
clearly that those cells are empty-by-source, not zero or omitted, and can tell at a glance
which rows are real measured data (`full_handshake`, `sign`) versus placeholders awaiting a
better source.

### 2.5 Row count

With 10 devices (`06-DEVICE-CATALOG.md` §1) × 6 algorithm variants (3 ML-KEM + 3 ML-DSA) × up
to 4 operations each (keygen/encaps/decaps/full_handshake, or keygen/sign/verify) plus the two
classical baselines (ECDH P-256, ECDSA P-256) with their own single `full_handshake`/`sign`
rows, the export is on the order of 200–250 rows — large enough to be genuinely useful in a
spreadsheet, small enough to open instantly with no pagination needed.

## 3. Numbers-only PDF

A second export option, alongside the narrative PDF from `06-DEVICE-CATALOG.md` §4: the exact
same row data as §2 above, rendered as a plain multi-page table — **no charts, no footnote
essay, no cover page prose** — for a user who specifically wants a printable/archivable numeric
record rather than a presentation document.

### 3.1 Content

- One continuous table, same columns as §2.2, paginated automatically as needed.
- A single header line per page: device/algorithm counts, data version, engine version,
  generation timestamp (so the file is still traceable, just without narrative framing).
- `null` cells render as an em dash (`—`) with a one-line legend at the bottom of the last page:
  *"— = no numeric figure published in the source literature for this operation."*
- No color-coded verdict cells, no charts — `mwc_verdict` and `confidence_tier` appear as plain
  text columns like everything else.

### 3.2 Where this lives

- **Web app**: a second button next to "Download PDF" on the States Dashboard
  (`07-STATES-DASHBOARD.md` §6) — "Download numbers only (PDF)" and "Download raw data (CSV)" /
  "Download raw data (JSON)" as three distinct, clearly-labeled export buttons.
- **CLI**:
  ```
  pqc-iot-sim export --format csv --out pqc-iot-data.csv
  pqc-iot-sim export --format json --out pqc-iot-data.json
  pqc-iot-sim export --format pdf --numbers-only --out pqc-iot-data.pdf
  ```
- All three reuse the exact same row-generation function (§2.2's schema), so the CSV, JSON, and
  numbers-only PDF are guaranteed to contain identical figures — only the container format
  differs.

## 4. Data generation function (shared by all three formats)

```
core.getOperationLevelData(deviceList, algoList):
  rows = []
  for device in deviceList:
    for algo in algoList:
      for operation in operationsFor(algo.family):   // keygen/encaps/decaps/full_handshake
                                                        // or keygen/sign/verify
        anchor = lookupAnchor(algo, operation)         // null if source doesn't publish it
        result = anchor != null
          ? core.simulate(device, algo, operation)     // measured or extrapolated, per §1.2 of
                                                         // 05-BENCHMARKING.md
          : { time_ms: null, confidence_tier: "unsupported", note: "no published per-phase figure" }
        rows.push({ device, algo, operation, ...result })
  return rows
```

This function is new (none of the earlier files needed operation-level granularity), but it
sits in `core/` alongside `getFullMatrix()` (`07-STATES-DASHBOARD.md` §4) and uses the same
`simulate()` primitive underneath — no parallel estimation logic, no risk of the export
disagreeing with the Simulator/Dashboard/Playground numbers for the operations that *are*
covered.

## 5. Tests (extends `04-TESTING.md` and `06-DEVICE-CATALOG.md` §4.3)

| Test | Expectation |
|---|---|
| CSV export row count | matches §2.5's formula exactly for the current device/algorithm catalog size — fails loudly if a device or algorithm is silently dropped |
| `full_handshake` rows for ML-KEM-512/768/1024 | `time_ms` equals the literature anchors (35.7 / 56.6 / 85.7) exactly |
| `keygen`/`encapsulate`/`decapsulate` sub-rows for ML-KEM | `time_ms` is `null` in every current export (since no source publishes the split), never a fabricated number |
| `sign` rows for ML-DSA-44/65/87 | `time_ms` matches (158.9 / 256.6 / 355.2), `cv_percent`/`p99_ms` populated where the source provides them (44 and 87; `65`'s `cv_percent`/`p99_ms` remain `null` per the existing data file) |
| CSV, JSON, and numbers-only PDF for the same catalog state | identical values row-for-row (format differs, numbers don't) |
| Numbers-only PDF | contains no chart elements, no colored verdict cells — purely text/table, confirmed by checking the generated PDF has no embedded image/path-fill objects beyond table borders |
| Adding a new device or a new algorithm variant | appears automatically in the next export of all three formats without a code change, same guarantee as `06-DEVICE-CATALOG.md` §4.3 |

## 6. Milestone addition

Extends `07-STATES-DASHBOARD.md` §9:

| Milestone | Scope | Exit criteria |
|---|---|---|
| M9 — Operation-level data export | `core.getOperationLevelData()`, CSV/JSON raw export, numbers-only PDF, three CLI/web export buttons | §5 tests pass; `null` is preserved everywhere the literature doesn't publish a per-phase figure, with zero fabricated numbers |
