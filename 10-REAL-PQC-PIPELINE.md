# PQC-on-IoT Simulator — Real-Hardware PQC Pipeline (Firmware → Device → Client)

Companion to `01-DESIGN.md` through `09-DATA-EXPORT.md`. Every earlier file models and
projects numbers from *published* literature. This file is different in kind: it's the plan
for actually **running real PQC operations on real IoT hardware**, collecting the measurements
that come out, and feeding them into the same web/CLI client as a new, clearly-labeled
`measured-live` data source — sitting alongside, not replacing, the literature anchors.

**Scope boundary, stated up front:** this pipeline performs real cryptographic operations
(key generation, encapsulation/decapsulation, signing/verification) using a vetted, audited
PQC library — it does not implement cryptographic primitives from scratch. Hand-written crypto
primitives are a well-known source of subtle, hard-to-detect vulnerabilities; this plan
deliberately builds on existing NIST-aligned implementations instead.

## 1. Goal

Turn the simulator from "projects numbers from a report" into "can also show you numbers your
own board actually produced," for anyone who has physical hardware to test. The web/CLI client
UI doesn't change — a result is a result — but each one now carries a data-source tag:
`literature-anchor` (existing), `extrapolated` (existing), or `measured-live` (new, from this
pipeline).

## 2. Architecture

```
┌────────────────────┐      serial/USB       ┌──────────────────────┐
│  Target IoT board   │◀──────────────────────▶│  Host collector       │
│  (firmware)          │                        │  script (Python/Node) │
│                      │                        │                        │
│  - PQC library       │                        │  - sends test commands│
│    (liboqs or        │                        │  - parses results      │
│    platform-specific │                        │  - runs KATs           │
│    PQC build)         │                        │  - writes result JSON │
│  - cycle counter      │                        └──────────┬────────────┘
│  - stack canary       │                                    │
│  - UART command loop   │                                    ▼
└────────────────────┘                         ┌──────────────────────┐
                                                 │  core/ ingestion       │
                                                 │  (same engine as the   │
                                                 │  rest of the project)  │
                                                 └──────────┬────────────┘
                                                             ▼
                                                  Web app + CLI, tagged
                                                  "measured-live"
```

Nothing here replaces `core/`'s existing estimation functions — it adds a new input path that
produces a `SimulationResult`-shaped object (same schema as `01-DESIGN.md` §8), so every
downstream consumer (Simulator tab, Compare, States Dashboard, exports) already knows how to
display it without modification.

## 3. PQC library selection

Use an existing, vetted implementation rather than writing NTT/polynomial-arithmetic code from
scratch:

| Option | Fit | Notes |
|---|---|---|
| **liboqs** (Open Quantum Safe project) | Primary recommendation | Maintains portable C implementations of ML-KEM and ML-DSA aligned to FIPS 203/204; widely used as a reference implementation; has a small-footprint build profile suitable for embedded targets |
| **pqm4 / mupq reference implementations** | Strong alternative for ARM Cortex-M specifically | The same codebase the source literature's own numbers came from — using it keeps results directly comparable to the literature anchors already in `benchmark-data/` |
| Vendor/platform PQC SDKs (e.g. an MCU vendor's own crypto HAL, if one exists for the target chip) | Use if available and audited | Only if the vendor's implementation has its own security review; otherwise prefer liboqs/pqm4 |

Decision rule: prefer whichever option already has a build profile for the target MCU family
with the smallest proven footprint; default to liboqs for portability across device families,
pqm4 specifically when the target is one of the ARM Cortex-M boards already in
`benchmark-data/devices.json` (so the live numbers can be directly set alongside that board's
literature anchor for comparison).

## 4. Firmware layer

### 4.1 Responsibilities

1. Link against the chosen PQC library (§3), built for the target MCU/toolchain.
2. Expose a simple command protocol over UART/USB-serial: host sends
   `RUN <algo_id> <operation> <iterations>`, firmware executes that operation that many times
   and reports back per-run cycle counts (via DWT/SysTick, same technique the literature used —
   `05-BENCHMARKING.md` §1.1 methodology #1) and peak stack usage (via the canary technique,
   methodology #5).
3. Run Known-Answer Tests (KATs) against the library's own test vectors before any timing run,
   and report pass/fail — this is a correctness gate, not a timing measurement: a device that
   fails its KATs should never contribute a `measured-live` number, since a broken
   implementation could otherwise silently produce a "fast but wrong" result.
4. Report flash usage (compiled firmware's `.text`/`.rodata` size) once at startup, not per-run.
5. No network, no key persistence, no production use — this firmware is a benchmarking harness,
   not a device's actual security firmware.

### 4.2 Firmware build pipeline

```
1. Select target board + toolchain (e.g. arm-none-eabi-gcc for Cortex-M targets)
2. Pull chosen PQC library (liboqs or pqm4) at a pinned version/commit
3. Build library for target, zero-wait-state clock config matching the methodology
   in 05-BENCHMARKING.md §1.1 (#2) so results stay comparable to the literature
4. Link against the command-loop/UART harness firmware
5. Run the library's own KAT suite on-device as a build gate
6. Flash to target
```

This mirrors methodology #7 (cross-architecture functional equivalence) from the source
report: the host-side collector can independently re-run the same inputs through the PQC
library's reference (non-embedded) implementation and compare outputs bit-for-bit, closing the
one methodology (`05-BENCHMARKING.md` §1.1, row 7) the simulator previously marked
"out of scope" — real hardware is what makes that methodology possible to actually perform.

## 5. Host collector

### 5.1 Responsibilities

- Enumerate the connected device (serial port), confirm firmware version/build hash matches
  what was flashed.
- Send `RUN` commands for each `(algorithm, operation, iteration count)` combination requested.
- Parse returned per-run cycle counts → convert to milliseconds using the board's actual clock
  (reported by firmware at connect time, not assumed).
- Compute mean/CV%/p95/p99 from the repeated runs, using the same statistical treatment as
  `05-BENCHMARKING.md` §1.3 (so a `measured-live` signature result is presented with the same
  shape of variance data as a literature one, not just a single number).
- Re-run the host-side reference implementation on the same test vectors and diff the output
  against what the device reported, satisfying methodology #7.
- Write one result file per run, same shape as a `SimulationResult`/operation-level row from
  `09-DATA-EXPORT.md` §2.2, with `data_source: "measured-live"`, a device fingerprint (not just
  an ID — actual detected clock, actual firmware build hash), and a timestamp.

### 5.2 Minimal CLI surface

```
pqc-iot-sim hw-test --port /dev/ttyACM0 --algo ml-kem-512 --runs 100
pqc-iot-sim hw-test --port /dev/ttyACM0 --algo ml-dsa-44 --runs 200 --operation sign
pqc-iot-sim hw-test --port /dev/ttyACM0 --kat-only        # correctness check only, no timing
```

Output: same table/JSON/CSV formatting as every other CLI command (`02-IMPLEMENTATION.md` §5),
with an added `data_source` column so it's never confused with a literature or extrapolated
row in a combined export.

## 6. Ingesting results into the client

1. Each completed hardware run writes a result file (JSON) with the schema from §5.1.
2. `core/` gains a small ingestion function, `core.importMeasuredResult(file)`, which validates
   the shape (required fields, plausible ranges — e.g. rejects a negative time or an
   impossible stack size as a corrupted/garbled capture) and stores it keyed the same way as
   the simulation cache in `05-BENCHMARKING.md` §2.2, but in a separate `measured-live` store
   so it's never silently conflated with a cached literature-based computation.
3. Every surface that already renders a `SimulationResult` — Simulator tab, Compare, States
   Dashboard, PDF/CSV exports — checks for a `measured-live` entry for the current
   device/algorithm/operation selection and, if present, shows it **alongside** the
   literature/extrapolated figure (not instead of it), clearly labeled, so a user can see both
   "what the report says" and "what my actual board did" at once.
4. The States Dashboard matrix (`07-STATES-DASHBOARD.md` §3.1) gets a small live-data indicator
   on any cell that has a `measured-live` result available, without changing the matrix's core
   layout.

## 7. Safety, correctness, and scope guardrails

- **Library choice is non-negotiable toward "use a vetted implementation."** This plan does not
  include, at any point, hand-written modular arithmetic, NTT, or sampling code — that is
  exactly the kind of cryptographic code that's easy to get subtly wrong and hard to verify
  without extensive peer review, which is why §3 insists on liboqs/pqm4/an audited vendor SDK
  rather than a from-scratch implementation.
- **KATs are a hard gate, not a warning.** A device/build that fails its known-answer tests must
  not produce a `measured-live` result at all — the collector should refuse to record timing
  data from a build that hasn't first proven it computes the right answer.
- **No production key material.** The firmware harness generates ephemeral keys purely to
  exercise the timing path; nothing is persisted to flash, nothing is exposed over the air, and
  this firmware is never intended to be the device's actual deployed security firmware — it's
  explicitly a benchmarking harness, and the Report/Method page should say so plainly if this
  pipeline is ever added.
- **Physical access only.** The collector talks to the device over a direct serial/USB
  connection on the bench; this plan does not include any network-exposed control path to the
  device under test.

## 8. Milestones

Extends `09-DATA-EXPORT.md` §6:

| Milestone | Scope | Exit criteria |
|---|---|---|
| M10 — Firmware harness | Command-loop firmware linking a chosen PQC library for one pilot board (e.g. the RP2040 or an STM32F4 Discovery, since both already have `devices.json` entries) | KAT suite passes on-device; cycle-count and stack-canary reporting works over UART |
| M11 — Host collector | `hw-test` CLI command, result-file writer, host-side reference-implementation cross-check | A `measured-live` result file is produced and matches the reference implementation's output bit-for-bit on the same inputs |
| M12 — Client ingestion | `core.importMeasuredResult()`, dual-display (literature vs. live) in Simulator/Compare/Dashboard | A result imported from M11 shows up correctly labeled everywhere a literature result would, without disturbing existing literature-only displays |

## 9. Repository integration status and import schema

This repository implements the measured-result validation/import path, browser JSON import,
CLI `measured import` / `measured list`, and separate live values in Simulator and Compare.
It does not yet contain the firmware or serial collector: those need a selected board, pinned
PQC library/toolchain, and physical hardware. The import path never synthesizes hardware data.

An imported JSON object (or an array of objects) uses this schema:

```json
{
  "schemaVersion": 1,
  "data_source": "measured-live",
  "timestamp": "2026-11-01T00:00:00.000Z",
  "deviceFingerprint": {
    "id": "rp2040",
    "name": "Raspberry Pi Pico",
    "cpu": "cortex-m0+",
    "ramKB": 264,
    "flashKB": 2048,
    "clockMHz": 133,
    "firmwareBuildHash": "sha256:..."
  },
  "algorithmId": "ml-kem-512",
  "operation": "encapsulate",
  "katPassed": true,
  "referenceCheckPassed": true,
  "measurement": {
    "runCount": 100,
    "meanMs": 1.23,
    "cvPercent": 2.1,
    "p95Ms": 1.28,
    "p99Ms": 1.31,
    "stackKB": 9.4,
    "flashKB": 42,
    "energyMJ": null
  }
}
```

The importer rejects missing identity/build metadata, unsupported operations, failed KAT/reference
checks, non-positive means/clocks, negative metrics, and stack/firmware footprints larger than the
reported device RAM/flash. It replaces the prior record for the same device, algorithm, and
operation. Imported records retain timestamp and firmware hash in the UI and CLI.
