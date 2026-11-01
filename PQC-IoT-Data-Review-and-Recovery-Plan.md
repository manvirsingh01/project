# PQC-on-IoT Simulator — Data Review, Problem Register & Recovery Plan

**Input reviewed:** `full-dataset.json` / `full-dataset.csv` / `full-dataset.pdf` / `full-matrix.pdf` (generated 2026-11-01, Data 1.2.0, Engine 1.2.0), plus the code that produced them (`core/dataExport.js`, `core/index.js`, `core/mwcRules.js`, `core/variance.js`, `benchmark-data/index.js`, `web/app.js`, `wokwi-projects/*`) and docs `01`–`11`.

**Purpose of this file**
1. Review what the export actually contains (what you *got*).
2. List every problem found (wrong, misleading, or inconsistent data).
3. List every piece of data you *did not get* and why.
4. Give a step-by-step plan to fix the problems and obtain the missing data.

> **How the numbers in this file were produced.** The counts below were derived by reading the dataset and the export code, not by running the code. Section 9 contains a small audit script (`scripts/audit-dataset.mjs`) that reproduces every count, so you can confirm them in 10 seconds. Values that come from my own knowledge of datasheets or standards (clock speeds, FIPS sizes) are marked **[verify]** and must be checked against the primary source before being committed to `benchmark-data/`.

---

## 1. Executive summary

| # | Finding | Impact |
|---|---|---|
| 1 | Only **56 of 230 rows (24%)** have a numeric time. **174 rows (76%)** are empty. | Most of the dataset is placeholders |
| 2 | Only **7 rows (3%)** are direct literature anchors (all on RP2040). The other **49** numeric rows are projections from one M0+ @133 MHz anchor set. | The dataset is a *model*, not a benchmark |
| 3 | **Zero** `measured-live` rows and **zero** `simulated-illustrative` rows. | The real-hardware pipeline (doc 10) and Wokwi (doc 11) have produced no data |
| 4 | **76 rows are labelled `data_source = literature-anchor` but 69 of them have no number at all.** | Labelling bug – misleading |
| 5 | Three M4 boards (CW308, L476RG, L4R5ZI) have **no clock** in the data, so the model silently assumes **133 MHz**. All three show an identical `19.297 ms`. | Likely **wrong by 1.1×–1.9×**; changes verdicts (see §7) |
| 6 | **Classical baselines (ECDH/ECDSA) are judged against PQC RAM floors** (64/128 KB). | 8 rows wrongly "infeasible/marginal" |
| 7 | **SLH-DSA-128s and LMS H25 are missing from the export entirely**, even though they are in the algorithm catalog and the matrix PDF. | 2 of 10 algorithms absent |
| 8 | **Flash footprint** is `null` for every algorithm and the export has **no flash column**. | MWC flash rule cannot be validated |
| 9 | Energy values are all ≈ **79 mW × time** (a single assumed power), and scaling energy linearly with time is physically wrong for low-clock chips. | Energy numbers are not independent measurements |
| 10 | Docs contradict each other and the code (e.g. CW308 + ML-KEM-512 `infeasible` in doc 04, `marginal` in doc 06 and in the code). | Test plan and data disagree |

**Bottom line:** the export is internally consistent *as a model*, but it overstates what is known. The fix is (a) correct the labelling/modelling bugs (no new data needed), (b) fill spec-defined constants (sizes, clocks), (c) ingest published per-operation benchmarks, (d) measure on real boards for the remaining gaps.

---

## 2. What you got — inventory

### 2.1 Shape

- **10 devices × 8 algorithms = 23 rows per device = 230 rows.**
  - ML-KEM-512/768/1024 → 4 rows each (`keygen`, `encapsulate`, `decapsulate`, `full_handshake`) = 12
  - ML-DSA-44/65/87 → 3 rows each (`keygen`, `sign`, `verify`) = 9
  - ECDH P-256 → 1 row (`full_handshake`)
  - ECDSA P-256 → 1 row (`sign`)
- Columns: 21 (see `DATA_EXPORT_COLUMNS`).

### 2.2 Row counts by status

| Category | Rows | % |
|---|---:|---:|
| Numeric `time_ms` present | 56 | 24.3 % |
| `time_ms = null` | 174 | 75.7 % |
| ↳ per-phase KEM (`keygen`/`encapsulate`/`decapsulate`) | 90 | |
| ↳ ML-DSA `keygen` + `verify` | 60 | |
| ↳ ECDSA `sign` | 10 | |
| ↳ architecture-excluded (ATtiny, MSP430: full_handshake/sign/ECDH) | 14 | |

### 2.3 Confidence tiers

| Tier | Rows | Which devices | What it really means |
|---|---:|---|---|
| `measured` | 7 | RP2040 only | Direct literature anchor (**not** measured by this project) |
| `interpolated` | 21 | STM32L031, nRF51822, STM32L053 | Clock-scaled M0/M0+ projection |
| `extrapolated` | 28 | CW308, L476RG, F4-Disco, L4R5ZI | M0+ → M4 projection (÷1.85, clock-scaled) |
| `unsupported` | 174 | all | No number |

### 2.4 MWC verdicts (all 230 rows)

| Verdict | Rows |
|---|---:|
| reliable | 89 |
| marginal | 16 |
| infeasible | 125 |

By device: F4-Disco, RP2040, L4R5ZI → all 23 reliable. L476RG → 20 reliable / 3 marginal (ML-DSA-87). CW308 → 13 marginal / 10 infeasible. STM32L031, STM32L053, nRF51822, ATtiny, MSP430 → all 23 infeasible.

### 2.5 Fields that are populated vs. empty

| Field | Populated rows | Comment |
|---|---:|---|
| `time_ms` | 56 | |
| `stack_kb` | 49 | ML-KEM-1024 and ECDH have none |
| `energy_mj` | 49 | ML-KEM-1024 has none; ECDSA has none |
| `payload_bytes` | ~60 | Only on `full_handshake`/`sign`/`verify`; **ML-KEM-768/1024 and ML-DSA-65 payload = null** |
| `cv_percent` | 8 (ML-DSA-44 sign) + 2 wrong | ML-DSA-65 / -87 = null |
| `p99_ms` | 16 | ML-DSA-65 = null |
| `device_firmware_hash` | **0** | No live data |
| `device_clock_mhz` | 140 / 230 | 3 devices have `null` (CW308, L476RG, L4R5ZI) |
| flash footprint | **no column** | Not exported at all |

---

## 3. Problem register

Severity: 🔴 wrong/misleading output · 🟠 modelling weakness · 🟡 cosmetic/doc.

### 3.1 Labelling and export bugs (fixable with no new data)

| ID | Sev | Problem | Evidence | Rows affected |
|---|---|---|---|---:|
| P1 | 🔴 | `data_source = "literature-anchor"` on rows that have **no number** | `dataExport.js`: `data_source: result.isExtrapolated ? "extrapolated" : "literature-anchor"` – an *unsupported* result has `isExtrapolated=false`, so it falls to "literature-anchor". RP2040 per-phase rows, all ATtiny/MSP430 rows, and ECDSA on 7 devices carry this label with `time_ms=null`. | 69 |
| P2 | 🔴 | `cv_percent = 67.5` shown on rows whose time is `null` | ATtiny and MSP430 `ml-dsa-44 / sign`: CV copied from the algorithm even though the architecture is excluded | 2 |
| P3 | 🔴 | `mwc_verdict` on per-phase rows duplicates the whole-algorithm verdict while `confidence_tier = unsupported`. A reader sees `reliable` + `unsupported` on the same row. | e.g. RP2040 `ml-kem-512 / keygen`: `reliable`, `unsupported`, `time=null` | 150 |
| P4 | 🔴 | **Classical baselines judged by PQC floors.** `classifyDevice` sends `ecdsa-*` to the 128 KB signing floor and ECDH (family `kem`) to the 64 KB floor. ECDH/ECDSA P-256 do not need 64–128 KB. | CW308 ECDSA = infeasible, ECDH = marginal; STM32L031/L053/nRF51822 ECDH/ECDSA = infeasible | 8 |
| P5 | 🔴 | **SLH-DSA-128s and LMS H25 absent from the export** (`operationPlan()` returns `[]`). Their payload anchors (7 856 B, 1 116 B) never reach the dataset. | PDF header says "Algorithms 8", catalog has 10 | 2 algos × 10 devices |
| P6 | 🔴 | **LMS (a verifier-only firmware use case) is classified with the 128 KB *signing* floor** in the matrix PDF. Verification needs very little RAM. Likewise SLH-DSA shows `reliable` on L476RG with **no time, stack, or energy anchor** – the verdict is the RAM-floor rule only. | `full-matrix.pdf` | 20 cells |
| P7 | 🟠 | Export has no columns for **flash footprint, p50, p95, expected rejection iterations, assumption flags, anchor id**. | `DATA_EXPORT_COLUMNS` | all |
| P8 | 🟠 | Tier name `measured` for RP2040 collides with `measured-live`. A literature anchor is not a measurement by this project. | `core/index.js` confidence logic | 7 |
| P9 | 🟡 | Numbers-only PDF: `source_citation` column (170 pt wide) is shorter than the longest citations (~95 chars at 4.5 pt) and overlaps `note`. | `columnWidths` in `dataExport.js` | cosmetic |
| P10 | 🟡 | `§` is replaced by `-` in PDF text (`01-DESIGN.md -4.2`). | `pdfText()` normalisation | cosmetic |

### 3.2 Modelling problems (change the numbers)

| ID | Sev | Problem | Why it matters |
|---|---|---|---|
| M1 | 🔴 | **Missing clocks are replaced by 133 MHz.** `clockMHz: null` for CW308, L476RG, L4R5ZI → `targetClock = 133`. All three give `19.297 ms` (ML-KEM-512) and `191.99 ms` (ML-DSA-87). | Real max clocks **[verify]**: STM32F303 (CW308) 72 MHz, STM32L476 80 MHz, STM32L4R5 120 MHz. Corrected times are 1.1×–1.9× slower (see §7), and some p99 alerts flip. |
| M2 | 🟠 | **Energy is `anchorEnergy × timeScale`.** This assumes the same power at 16 MHz as at 133 MHz. Power falls with clock, so energy per operation stays roughly constant (dynamic part). Result: STM32L031 ECDH `203 mJ`, nRF51822 ECDH `406 mJ` – overstated. | Energy comparisons across devices are unreliable |
| M3 | 🟠 | **All energy anchors ≈ 79 mW × time** (2.83/35.7 = 79.3; 12.5/158.9 = 78.7; 20.3/256.6 = 79.1; 28.1/355.2 = 79.1; ECDH 48.9/606 = 80.7). They look **derived**, not measured. | Cannot be quoted as measured energy |
| M4 | 🟠 | **Handshake payload undercounted.** ML-KEM-512 uses `800 B` (public key only). A KEM exchange sends public key **and** ciphertext (800 + 768 = 1 568 B). Network chart/fragment counts are about half the real value. | Understates 6LoWPAN cost |
| M5 | 🟠 | **Fixed 1.85× M4/M7 speed-up** applied to every algorithm. KEM (NTT-heavy) and ML-DSA (hash-heavy, Keccak) speed up differently on M4. | Systematic bias; unvalidated |
| M6 | 🟠 | **Variance model** needs CV; ML-DSA-87 has p99 but **no CV**, ML-DSA-65 has **neither**. p95 for those is unavailable. | Tail-latency alerts only for 44/87 |
| M7 | 🟠 | `kemNearFloor` rule (RAM 32–63 KB → marginal) is a hand-made exception to make CW308 `marginal`. | Verdict depends on an unsourced exception |
| M8 | 🟠 | MWC is **RAM-only for most rows**; flash footprint of the algorithm is unknown (null), so the 512 KB / 1 MB flash rule is checked against *device* flash, never against *firmware size*. | STM32L031 (32 KB flash) cannot hold ML-KEM code + app, but the verdict is driven only by RAM |
| M9 | 🟡 | RP2040 `ml-dsa-87` p99 = 1 125 ms triggers the 1 000 ms watchdog alert, but the watchdog default is an unsourced constant. | Alert threshold needs a sourced rationale |

### 3.3 Documentation contradictions

| ID | Conflict | Resolution |
|---|---|---|
| D1 | Doc 04 §3.4: CW308 + ML-KEM-512 = `infeasible`. Doc 06 §2 and code/tests (`tests/core.test.js`): `marginal`. | Pick one rule, update doc 04 |
| D2 | Doc 06 §1 one-liners say STM32L031 / nRF51822 "ML-KEM-512 marginal"; Doc 06 §2 matrix and code say `infeasible` (8–16 KB RAM < 32 KB near-floor). | Fix doc 06 §1 |
| D3 | Doc 09 §2.4 lists `data_source` values `literature-anchor | extrapolated | measured-live`; code also emits `simulated-illustrative`. | Update doc 09 enum |
| D4 | Doc 02 §3.3 pseudocode (`< 0.8 → infeasible`) lacks the `kemNearFloor` branch and the stack-headroom branch present in code. | Sync doc 02 |
| D5 | `04-TESTING.md` §2 mentions JSON data files; repo uses ES modules. | Note in doc |

### 3.4 Wokwi / hardware-sim files

| ID | Sev | Problem |
|---|---|---|
| W1 | 🟠 | `wokwi-projects/attiny-avr/platformio.ini` lists `arduino-libraries/SoftwareSerial@^1.0.6`. SoftwareSerial normally ships with the AVR/ATtiny core; this registry package is not the right dependency and will likely fail to resolve. **[verify by running `pio run`]** |
| W2 | 🟡 | `main.ino` names the object `Serial` (`SoftwareSerial Serial(PB0, PB1)`), shadowing the core symbol. Works on cores with no `Serial`, but fragile. |
| W3 | 🟡 | Both sketches are in the project as `main.ino` (ATtiny) and `main.cpp` (RP2040) but `11-WOKWI-SIMULATION.md` §4 lists a `stm32-generic/` project that does not exist. |
| W4 | 🟠 | **No Wokwi rows were imported** (`simulated-illustrative` = 0). Nothing has been run end-to-end. |
| — | ℹ️ | Even when run, Wokwi rows are dummy-loop timings and **cannot** fill any PQC gap. They are demo data only. |

---

## 4. Missing data register — "data you have not got"

| Gap | What is missing | Rows / cells affected | Obtainable from | Needs hardware? |
|---|---|---:|---|---|
| **G1** | Per-phase times: ML-KEM `keygen`, `encapsulate`, `decapsulate` | 90 rows (9 per device) | pqm4/mupq benchmark tables (M4); the M0 paper cited as report ref. 3; own measurement for RP2040 | Partly |
| **G2** | ML-DSA `keygen` and `verify` times | 60 rows | pqm4 benchmark tables; ref. 3 | Partly |
| **G3** | ML-KEM-1024 stack and energy; ECDH stack | 3 devices × cells | pqm4 stack table; own stack-painting run | Partly |
| **G4** | ML-DSA-65 CV, p99; ML-DSA-87 CV; ML-DSA-65/87 iteration counts | 4 anchors | Run ≥1000 signing loops (host or board) – distribution is hardware-independent in *iterations*, time-dependent only by scale | Host is enough for iteration stats |
| **G5** | ECDSA P-256 sign time/energy/stack; verify | 10 rows | micro-ecc / mbedTLS / uECC benchmarks; own run | Yes (or published) |
| **G6** | SLH-DSA-128s and LMS H25 time, stack, energy, verify | 2 algos × 10 devices | pqm4 (SPHINCS+), hash-sigs / LMS-reference benchmark papers (report refs 31–34) | Partly |
| **G7** | **Flash footprint** per algorithm (`.text` + `.rodata`) | all | `arm-none-eabi-size` on pqm4 builds | No (build only) |
| **G8** | **Clock for 3 boards** | CW308, L476RG, L4R5ZI | Datasheets **[verify]** | No |
| **G9** | **Fixed-size constants**: pk, sk, ciphertext, signature | ML-KEM-768/1024 payload, ML-DSA-65 payload, SLH-DSA/LMS pk/sk | FIPS 203/204/205, RFC 8554 | No |
| **G10** | **Real power model**: mW vs clock, active current | all energy cells | Datasheet + Joulescope/Otii capture | Yes |
| **G11** | **Network**: link data rates (throughput is `null`), LoRa airtime, LoRa payload limits | Network tab, Playground | IEEE 802.15.4 (250 kb/s @ 2.4 GHz), Semtech LoRa airtime formula, LoRaWAN Regional Parameters **[verify]** | No |
| **G12** | **`measured-live` rows** | 0 / 230 | Firmware harness + collector (doc 10) | Yes |
| **G13** | **8/16-bit devices** (ATtiny, MSP430): numbers are `null` *by rule*, not because nothing exists | 14 rows | Published AVR/MSP430 PQC implementations (literature search) – optional | No |
| **G14** | Source-to-number mapping (`anchor id → paper`) | all anchors | Re-open the research report; map each number to a citation number | No |

---

## 5. Target data model (v2)

Add these columns to the export (keep the existing 21 for backward compatibility):

```
value_kind            // anchor | derived | measured-live | simulated-illustrative | spec-constant | unavailable
anchor_id             // stable id of the source row, e.g. "pqm4:kyber512:m4:keypair"
assumptions           // pipe-separated: clock-assumed|speedup-1.85|power-constant
clock_assumed         // true/false
flash_footprint_kb    // .text+.rodata, null until sourced
p50_ms, p95_ms        // already computed in core, not exported
expected_iterations   // ML-DSA rejection sampling
pk_bytes, sk_bytes, ct_or_sig_bytes
handshake_bytes       // pk+ct for KEM; pk+sig for signature use case
mwc_applicable        // false for classical baselines
```

`data_source` becomes derived from `value_kind` and is **never** `literature-anchor` when `time_ms` is null; use `unavailable`.

Rule enforced by tests (see §8): **a non-null number must have an `anchor_id` or a `derivation` string; a null number must have `value_kind = unavailable` and a `note`.**

---

## 6. Implementation plan

Effort estimates are for one developer who already knows the repo.

### Phase 0 — Freeze & audit (0.5 day)

1. Commit current export as `tests/fixtures/full-dataset.v1.json`.
2. Add `scripts/audit-dataset.mjs` (Appendix A) and run it. Confirm the counts in §2.
3. Create branch `data-recovery`.

**Exit:** audit output matches §2; baseline fixture committed.

### Phase 1 — Fix labelling & export bugs (1 day, no new data)

**1.1 P1 – honest `data_source`** (`core/dataExport.js`)

```diff
-          data_source: result.isExtrapolated ? "extrapolated" : "literature-anchor",
+          data_source: !available ? "unavailable" : (result.isExtrapolated ? "extrapolated" : "literature-anchor"),
```

**1.2 P2 – no CV/p99 on unavailable rows**

```diff
-          cv_percent: operation === "sign" ? algo.cvPercent ?? null : null,
-          p99_ms: operation === "sign" ? result.estimatedP99Ms ?? null : null,
+          cv_percent: available && operation === "sign" ? algo.cvPercent ?? null : null,
+          p99_ms: available && operation === "sign" ? result.estimatedP99Ms ?? null : null,
```

**1.3 P3 – verdict semantics.** For rows where `available === false`, keep the algorithm-level verdict but add `mwc_scope = "algorithm"`; or set `mwc_verdict = null` on per-phase rows. Recommended: add the column `mwc_scope` and keep the value (cheaper, no consumer breakage).

**1.4 P4 – classical baselines are not MWC subjects.** In `core/mwcRules.js`:

```js
export function classifyDevice(device, requiredAlgos = []) {
  const classicalOnly = requiredAlgos.length > 0 && requiredAlgos.every((a) => a?.level === 0);
  if (classicalOnly) {
    return { verdict: "not-applicable", reasons: ["Classical baseline; MWC floors are defined for PQC workloads."] };
  }
  // ...existing logic unchanged
}
```

Update `core/alerts.js` (skip `not-applicable`), the States dashboard colour map, and the CLI exit-code logic (treat as non-failing). Add the verdict to the PDF colour table.

**1.5 P5/P6 – add SLH-DSA and LMS rows, and a verifier-only profile.**

```js
function operationPlan(algo) {
  // ...existing
  if (algo.id === "slh-dsa-128s") return ["keygen", "sign", "verify"];
  if (algo.id === "lms-h25")      return ["verify"];          // firmware-verification use case
  return [];
}
```

In `classifyDevice` add `role: "verify-only"`; for LMS use a verify RAM floor (**to be sourced in Phase 4 – until then output `verdict: "unknown"` with reason "no RAM anchor"** instead of applying the 128 KB signing floor). Principle: **no verdict without an anchor** → return `unknown`, not `reliable`.

**1.6 P7 – new columns.** Extend `DATA_EXPORT_COLUMNS` (append, don't reorder), populate from `result` fields already computed (`estimatedP50Ms`, `estimatedP95Ms`, `expectedRejectionIterations`, `estimatedFlashKB`).

**1.7 P8 – rename tier.** `measured` → `literature-exact`. Keep `measured-live` for real runs. Update `tests/core.test.js`, `tests/cli.test.js`, `web/app.js` badge CSS, docs 05/09.

**1.8 P9/P10 – PDF widths.** Set `source_citation` width to 260 and `note` to 330; move `§` handling to WinAnsi `\247` instead of `-`.

**Exit:** `npm test` green after updating the intended expectation changes; audit script shows `null-time & literature-anchor = 0`.

### Phase 2 — Fill spec constants (0.5 day, no hardware)

These are fixed by the standards, not benchmark results. Add to `benchmark-data/index.js` with `source: "FIPS 203 Table 3"` etc. **[verify each against the standard before committing]**

| Algorithm | pk / ek (B) | sk / dk (B) | ciphertext / signature (B) |
|---|---:|---:|---:|
| ML-KEM-512 | 800 | 1 632 | 768 |
| ML-KEM-768 | 1 184 | 2 400 | 1 088 |
| ML-KEM-1024 | 1 568 | 3 168 | 1 568 |
| ML-DSA-44 | 1 312 | 2 560 | 2 420 |
| ML-DSA-65 | 1 952 | 4 032 | 3 309 |
| ML-DSA-87 | 2 592 | 4 896 | 4 627 |
| SLH-DSA-128s | 32 | 64 | 7 856 |

Impact on the network model (802.15.4, 81 B single-hop / 45 B multi-hop frames):

| Message | Bytes | Fragments (1 hop) | Fragments (multi-hop) |
|---|---:|---:|---:|
| ML-KEM-512 handshake (pk + ct) | 1 568 | 20 | 35 |
| ML-KEM-768 handshake | 2 272 | 29 | 51 |
| ML-KEM-1024 handshake | 3 136 | 39 | 70 |
| ML-DSA-65 signature | 3 309 | 41 | 74 |
| ML-DSA-87 signature | 4 627 | 58 | 103 |

Model each direction as its own datagram (pk is one message, ct another) rather than one 1 568 B message – retransmission cost differs even though independent-loss success multiplies out to the same value.

**Exit:** `payload_bytes` no longer null for any ML-KEM/ML-DSA row; `tests/data.test.js` updated with the table above.

### Phase 3 — Fix device specifications (0.5 day)

1. In `benchmark-data/index.js` set `clockMHz` for the three boards from the datasheet **[verify]**: CW308-STM32F3 (STM32F303) 72, NUCLEO-L476RG 80, NUCLEO-L4R5ZI 120 MHz. Record `source: "datasheet <part> §<x>"`.
2. Keep an explicit field `clockIsNominal` for any device still without a sourced clock; propagate `clock_assumed = true` to the export and a visible badge in the UI.
3. Delete the silent `|| 133` fallback for reference devices; fail the data test if a numeric-capable device has no clock.
4. Re-run the full suite. Expect **intended** changes in `tests/core.test.js`, `tests/alerts.test.js`, `tests/browser.test.js` (Playground timings), and doc 05 §3.4 (the ML-DSA-87 tail-latency case now also fires on L476RG/CW308).

**Exit:** no export row has `clock_assumed = true` for a reference device.

### Phase 4 — Ingest published per-operation data (3–5 days, no hardware)

Goal: fill G1, G2, G3, G6, G7 from existing literature rather than inventing a split.

1. **Create `benchmark-data/literature/`** with one file per source, e.g. `pqm4-m4.json`, `m0-paper.json`, each row:
   ```json
   { "anchor_id": "pqm4:mlkem512:m4:keypair", "device_family": "cortex-m4", "clock_mhz": 24,
     "algo_id": "ml-kem-512", "operation": "keygen", "cycles": 0, "stack_bytes": 0,
     "code_bytes": 0, "source": "<URL/paper + table>", "retrieved": "YYYY-MM-DD" }
   ```
   (`0` placeholders above are *format examples only* – fill with the published figures.)
2. **Sources to pull** (in this order):
   - The M0 paper already in your bibliography (report ref. 3, *ML-KEM and ML-DSA on ARM Cortex-M0*): check whether it publishes per-phase cycles – that would give G1/G2 directly for the M0+ family and for RP2040/STM32L0/nRF51.
   - **pqm4 / mupq** benchmark tables: per-operation cycles, stack, and size for ML-KEM, ML-DSA, SPHINCS+ on STM32F4 (M4). Fills G1, G2, G3, G6 for M4 boards.
   - LMS/XMSS comparisons already listed (report refs 31–34) → G6 for LMS verify.
   - micro-ecc / mbedTLS published P-256 timings → G5.
3. **Convert cycles → ms** in a small tool, not by hand: `ms = cycles / (clockMHz × 1000)`. Store cycles as the primary anchor; time is derived. This also removes the "M0+ @133 MHz only" limitation – the model can scale from the *nearest* anchor family instead of one global anchor.
4. **Keep `null` where nothing is published.** Do not split `full_handshake` into phases by proportion.
5. **Reconcile with existing anchors:** the existing `35.7 ms` (full handshake) must equal keygen + encaps + decaps from the new per-phase data within rounding. If it does not, record the discrepancy in `known-discrepancies.md` and keep both with their sources.
6. **Validate the 1.85× M4 factor** (M5): compute ratio = M0+ cycles / M4 cycles *per algorithm* from the ingested tables. If KEM and DSA ratios differ, replace the constant with per-algorithm-family factors.
7. **Flash footprint (G7):** build the pqm4 targets and run `arm-none-eabi-size` on each scheme (`.text + .rodata`); store as `flash_footprint_kb` with the toolchain version and flags.

**Exit:** each non-null row has an `anchor_id`; gap counts in §4 for G1/G2/G3/G6/G7 reduced to "not published" rows only; audit shows the numeric-time share rising from 24 % to the maximum the literature supports.

### Phase 5 — Fill statistical gaps on the host (1 day, no board)

G4 (ML-DSA-65 CV/p99, ML-DSA-87 CV):

1. Build a reference ML-DSA implementation on the host (use a vetted library – liboqs or PQClean; **do not write your own**).
2. Instrument the **number of rejection-sampling iterations** over ≥ 10 000 signatures per parameter set. Iteration statistics are platform-independent.
3. Report: mean iterations, CV of iterations, p95/p99 of iterations. These replace the hand-picked `4.25` / `5.1` and give 87 an anchor.
4. Convert to time on a target by `time = iterations × per-iteration time` once Phase 4/6 provide the per-iteration cost. Mark the result `value_kind = derived`.

### Phase 6 — Real-hardware measurement (5–10 days, needs boards)

Implements doc 10 for the gaps that literature cannot fill (RP2040 per-phase, M0+ boards, energy, flash).

| Board | Why | Cycle counter |
|---|---|---|
| RP2040 Pico | The anchor board; per-phase and verify missing | 64-bit µs timer or SysTick (no DWT on M0+) |
| STM32F4 Discovery | pqm4 reference; cross-check against published pqm4 | DWT `CYCCNT` |
| NUCLEO-L476RG / L4R5ZI | Validate the corrected-clock projections | DWT |

Steps:

1. Firmware harness: vetted library (PQClean/mlkem-native/mldsa-native or pqm4), UART command loop `RUN <algo> <op> <n>`, KAT self-test gate, stack painting, `arm-none-eabi-size` report.
2. Host collector: runs the same inputs on the host reference, compares output bit-for-bit, computes mean/CV/p50/p95/p99, writes JSON matching the existing `validateMeasuredResult` schema (`schemaVersion: 1`, `katPassed`, `referenceCheckPassed`, `firmwareBuildHash`).
3. **Energy (G10):** measure with a Joulescope/Otii (or a shunt + scope) at ≥ 2 clock settings per board to build the real mW-vs-MHz line; replace the constant-power model (M2/M3). Until then show energy as an **interval** (`[E_const, E_const × timeScale]`) and label it `derived`.
4. Import with `node cli/pqc-iot-sim.js measured import --file run.json`; rows appear as `measured-live` with firmware hash and timestamp.
5. Add a **regression comparison**: `measured-live` vs. literature-projection per cell; flag > 15 % divergence in the dashboard.

**Exit:** ≥ 1 board with a full set of per-operation `measured-live` rows; energy line for ≥ 1 board.

### Phase 7 — Network model completion (1 day, no hardware)

Fills G11.

1. Add `dataRateKbps` to `network` data: 802.15.4 @ 2.4 GHz = 250 kb/s **[verify]**.
2. Add LoRa airtime from the Semtech formula as a pure function of SF, BW, CR, payload; add the LoRaWAN max app payload per data rate from the Regional Parameters (EU868 DR0–2 = 51 B **[verify]** – this also gives your 51-byte default a real source).
3. Compute `effectiveThroughputBps` and total handshake airtime instead of returning `null`.
4. Replace "independent per-fragment loss" with an optional burst model (Gilbert-Elliott) and keep the independent model as the labelled default.

### Phase 8 — Wokwi clean-up (0.5 day)

1. Remove the `lib_deps` SoftwareSerial entry in `wokwi-projects/attiny-avr/platformio.ini`, use the core-bundled library, rename the object (`SoftwareSerial uart(PB0, PB1)`), and confirm `pio run` succeeds.
2. Run both projects once, paste serial output into the Hardware Sim view, confirm 3 rows per project import as `simulated-illustrative`.
3. Either create the `stm32-generic` project promised in doc 11 or delete it from the doc.
4. Keep Wokwi rows visually separate; they never fill a PQC gap.

### Phase 9 — Documentation sync (0.5 day)

Fix D1–D5, update docs 05, 06, 09, 10 for the new columns, tier names, `not-applicable` / `unknown` verdicts, and source files. Add a "Data completeness" table to `README.md` generated by the audit script so the numbers never drift.

---

## 7. Preview: how the numbers change after Phase 3 (clock fix)

ML-KEM-512 `full_handshake` and ML-DSA-87 `sign` using the model's own formula `anchor × (133 / clock) / 1.85` (clocks marked **[verify]**):

| Device | Clock used now | Clock after fix | KEM-512 now → after | ML-DSA-87 mean now → after | ML-DSA-87 p99 now → after |
|---|---:|---:|---:|---:|---:|
| CW308-STM32F3 | 133 (assumed) | 72 | 19.3 → **35.7 ms** | 192 → **354.6 ms** | 608 → **1 123 ms** (> 1 000 ms alert) |
| NUCLEO-L476RG | 133 (assumed) | 80 | 19.3 → **32.1 ms** | 192 → **319.2 ms** | 608 → **1 011 ms** (> 1 000 ms alert) |
| NUCLEO-L4R5ZI | 133 (assumed) | 120 | 19.3 → **21.4 ms** | 192 → **212.8 ms** | 608 → **674 ms** |
| STM32F4 Discovery | 168 | 168 | 15.3 | 152.0 | 481 |

Consequences: CW308 and L476RG would be **slower than the RP2040 row** for KEM and would trigger the tail-latency warning for ML-DSA-87. The "M4 is faster" story in the dashboard weakens for the low-clock boards. This is exactly why G8 must be fixed first.

---

## 8. Quality gates (tests to add)

Add `tests/data-quality.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { devices, algorithms } from "../benchmark-data/index.js";
import { getOperationLevelData } from "../core/dataExport.js";

const rows = getOperationLevelData(devices);

test("a null time never carries a literature or extrapolated label", () => {
  const bad = rows.filter((r) => r.time_ms == null && r.data_source !== "unavailable" && r.data_source !== "measured-live");
  assert.deepEqual(bad.map((r) => `${r.device_id}/${r.algo_id}/${r.operation}`), []);
});

test("unavailable rows carry no CV or p99", () => {
  assert.equal(rows.filter((r) => r.time_ms == null && (r.cv_percent != null || r.p99_ms != null)).length, 0);
});

test("every numeric time has a provenance string", () => {
  assert.equal(rows.filter((r) => r.time_ms != null && !r.source_citation).length, 0);
});

test("numeric-capable reference devices have a sourced clock", () => {
  const bad = devices.filter((d) => !["avr-8bit", "msp430-16bit"].includes(d.cpu) && !Number.isFinite(d.clockMHz));
  assert.deepEqual(bad.map((d) => d.id), []);
});

test("classical baselines are not judged by PQC floors", () => {
  const classical = rows.filter((r) => ["ecdh-p256", "ecdsa-p256"].includes(r.algo_id));
  assert.ok(classical.every((r) => r.mwc_verdict === "not-applicable"));
});

test("all catalog algorithms with a payload anchor appear in the export", () => {
  const ids = new Set(rows.map((r) => r.algo_id));
  for (const a of algorithms.filter((x) => x.payloadBytes != null)) assert.ok(ids.has(a.id), a.id);
});

test("per-phase times sum to the combined handshake within 5 %", () => {
  // activates once Phase 4 supplies per-phase rows
  for (const dev of devices) for (const kem of ["ml-kem-512", "ml-kem-768", "ml-kem-1024"]) {
    const get = (op) => rows.find((r) => r.device_id === dev.id && r.algo_id === kem && r.operation === op)?.time_ms;
    const parts = ["keygen", "encapsulate", "decapsulate"].map(get);
    const full = get("full_handshake");
    if (parts.every(Number.isFinite) && Number.isFinite(full)) assert.ok(Math.abs(parts.reduce((a, b) => a + b) - full) / full < 0.05);
  }
});
```

Add `npm run test:data-quality` and include it in `npm test`.

**Release gate:** a build is "data-complete" when `audit-dataset` reports 0 contradictions and every remaining `null` has an `unavailable` label plus a note naming the missing source.

---

## 9. Appendix A — audit script

Save as `scripts/audit-dataset.mjs`; run `node scripts/audit-dataset.mjs full-dataset.json`.

```js
import { readFileSync } from "node:fs";

const rows = JSON.parse(readFileSync(process.argv[2] ?? "full-dataset.json", "utf8"));
const tally = (fn) => rows.reduce((m, r) => { const k = fn(r); m[k] = (m[k] ?? 0) + 1; return m; }, {});
const pct = (n) => `${n} (${(100 * n / rows.length).toFixed(1)}%)`;

console.log("rows:", rows.length);
console.log("devices:", new Set(rows.map((r) => r.device_id)).size, "algorithms:", new Set(rows.map((r) => r.algo_id)).size);
console.log("numeric time:", pct(rows.filter((r) => r.time_ms != null).length));
console.log("by confidence_tier:", tally((r) => r.confidence_tier));
console.log("by data_source:", tally((r) => r.data_source));
console.log("by mwc_verdict:", tally((r) => r.mwc_verdict));
console.log("by operation (null time):", tally((r) => (r.time_ms == null ? r.operation : "—")));

console.log("\n--- contradictions ---");
console.log("null time but data_source=literature-anchor:", rows.filter((r) => r.time_ms == null && r.data_source === "literature-anchor").length, "(expect 69 before fixes)");
console.log("CV present but time null:", rows.filter((r) => r.time_ms == null && r.cv_percent != null).length, "(expect 2)");
console.log("devices with null clock:", [...new Set(rows.filter((r) => r.device_clock_mhz == null).map((r) => r.device_id))]);
console.log("identical ML-KEM-512 handshake across devices:",
  Object.entries(rows.filter((r) => r.algo_id === "ml-kem-512" && r.operation === "full_handshake" && r.time_ms != null)
    .reduce((m, r) => { (m[r.time_ms] ??= []).push(r.device_id); return m; }, {})).filter(([, d]) => d.length > 1));
console.log("payload null on full_handshake/sign/verify:",
  rows.filter((r) => ["full_handshake", "sign", "verify"].includes(r.operation) && r.payload_bytes == null).map((r) => `${r.algo_id}`).filter((v, i, a) => a.indexOf(v) === i));
console.log("energy/time power (mW) per algorithm:",
  Object.fromEntries([...new Set(rows.map((r) => r.algo_id))].map((a) => {
    const r = rows.find((x) => x.algo_id === a && x.device_id === "rp2040" && x.time_ms && x.energy_mj);
    return [a, r ? +(r.energy_mj / r.time_ms * 1000).toFixed(1) : null];
  })));
console.log("live rows:", rows.filter((r) => r.data_source === "measured-live").length,
            "wokwi rows:", rows.filter((r) => r.data_source === "simulated-illustrative").length);
```

Expected output on the supplied dataset: 230 rows; 56 numeric; tiers 7 / 21 / 28 / 174; verdicts 89 / 16 / 125; contradictions 69 and 2; null-clock devices `cw308-stm32f3, nucleo-l476rg, nucleo-l4r5zi`; power ≈ 79–81 mW for every algorithm; 0 live rows; 0 Wokwi rows.

---

## 10. Appendix B — suggested order and effort

| Order | Phase | Days | Blocks on | Closes |
|---:|---|---:|---|---|
| 1 | 0 Audit | 0.5 | — | baseline |
| 2 | 1 Label/export fixes | 1 | 0 | P1–P10 |
| 3 | 3 Clock fix | 0.5 | 0 | M1, G8 |
| 4 | 2 Spec constants | 0.5 | 0 | G9, M4 |
| 5 | 4 Literature ingest | 3–5 | 1 | G1, G2, G3, G6, G7, M5, G14 |
| 6 | 5 Host statistics | 1 | — | G4, M6 |
| 7 | 7 Network completion | 1 | 2 | G11 |
| 8 | 8 Wokwi clean-up | 0.5 | — | W1–W4 |
| 9 | 6 Hardware measurement | 5–10 | boards, 4 | G5, G10, G12, M2, M3 |
| 10 | 9 Docs sync | 0.5 | all | D1–D5 |

**Total:** ~2 weeks without hardware, ~3 weeks including board measurement.

---

## 11. What I could not verify

- I did not execute the repo; counts come from reading the data and code (reproduce with Appendix A).
- Clock speeds (72/80/120 MHz), FIPS size tables, 250 kb/s and the LoRaWAN 51-byte limit are from memory and flagged **[verify]**.
- I did not have the original research report, so I could not map anchors to their papers (G14) or check whether the cited M0 paper already publishes per-phase times. That check is the single highest-value first step in Phase 4.
- The `1.85×` M4 factor and the energy anchors may be correct in the source report; the problem is that the *dataset does not show where they came from*.


## 12. Recovery work completed (2026-11-01)

- Fixed unavailable-row labeling and copied signing variance; added operation scope, provenance, model assumptions, percentile, footprint, standard-size, and applicability columns.
- Added SLH-DSA keygen/sign/verify rows and LMS verify rows. Their unsupported timings remain null, and resource verdicts are `unknown` until implementation RAM anchors exist. Classical baselines now report `not-applicable` for PQC MWC floors.
- Corrected reference board nominal clocks (CW308 72 MHz, L476 80 MHz, L4R5 120 MHz) and marked these as assumptions. The values are documented as manufacturer maximum clocks, not measured board configurations.
- Filled FIPS 203/204/205 size constants. KEM `handshake_bytes` now represents public key plus ciphertext.
- Renamed the direct literature tier to `literature-exact`; fixed PDF section glyph and refreshed `full-dataset.json`, `full-dataset.pdf`, and `full-matrix.pdf`.
- Removed the extraneous PlatformIO SoftwareSerial package and renamed the sketch UART object. Corrected the Wokwi file map. Wokwi execution was not validated because PlatformIO is unavailable in this environment.
- Kept per-phase timing, power/energy, flash footprint, and hardware measurements unavailable; the repository does not contain defensible source measurements for them.

Verified against primary sources: [NIST FIPS 203](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.203.pdf), [NIST FIPS 204](https://nvlpubs.nist.gov/nistpubs/fips/nist.fips.204.pdf), [NIST FIPS 205](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.205.pdf), [ST STM32F303](https://www.st.com/resource/en/datasheet/stm32f303rb.pdf), [ST STM32L476](https://www.st.com/resource/en/datasheet/stm32l476qe.pdf), and [ST STM32L4R5](https://www.st.com/resource/en/datasheet/stm32l4r5qi.pdf).

Validation: `npm test` passes (46 pass; one Playwright suite skipped because Playwright is not installed), and `npm run check` passes.
