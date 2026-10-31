# PQC-on-IoT Simulator — Design & Definition

## 1. Problem statement

IoT devices are limited in CPU power, RAM, flash, energy, and network bandwidth. Post‑quantum
cryptography (PQC) — ML‑KEM for key exchange, ML‑DSA for signatures, plus hash‑based
alternatives (SLH‑DSA, LMS/XMSS) — needs more compute, memory, and bandwidth than the
classical ECC/RSA it replaces. The open question: **what is the smallest IoT hardware
configuration that can run PQC reliably, and which algorithm/device combination fits which
use case?**

This project turns that question into a tool: a simulator that lets a user pick a device profile
and an algorithm, and see projected execution time, RAM/flash footprint, energy use, and
network overhead — all derived from the benchmarking literature (pqm4/mupq-style studies on
ARM Cortex‑M0+/M4 targets) rather than from running real cryptographic code.

It is explicitly a **modeling/benchmark-projection tool**, not a cryptographic implementation.
It does not perform real ML‑KEM/ML‑DSA operations; it reproduces and interpolates published
benchmark data so users can explore trade-offs without owning the physical boards.

## 2. Goals

1. Let a user pick or define an IoT device profile (CPU family, clock speed, RAM, flash, radio).
2. Let a user pick a PQC algorithm + parameter set (ML-KEM-512/768/1024, ML-DSA-44/65/87,
   SLH-DSA-128s, LMS/XMSS) or a classical baseline (ECDH P-256, ECDSA P-256).
3. Report, per combination: cycle/time estimate, peak stack RAM, flash footprint, energy per
   operation, and — for signatures — rejection-sampling variance (mean, CV%, p95/p99).
4. Model network overhead for a chosen link (IEEE 802.15.4/6LoWPAN, LoRa): payload size,
   fragment count, effective throughput, and failure probability under a given packet-loss rate.
5. Flag whether a configuration is "Reliable" / "Marginal" / "Infeasible" against a Minimum
   Workable Configuration (MWC) rule derived from the literature.
6. Let the user add **custom** device profiles (arbitrary RAM/flash/clock/radio) and get an
   extrapolated (clearly labeled as estimated) result, not just the five reference boards.
7. Ship as both a **web app** (interactive, visual) and a **CLI** (scriptable, same engine,
   usable in CI/batch benchmarking workflows) — both backed by one shared data/estimation core
   so they never disagree.
8. Include a literature/report view inside the web app summarizing the methodology and
   citing the source findings, so the tool is self-documenting.

## 3. Non-goals

- Not a real crypto library; produces no actual keys/signatures/ciphertexts.
- Not a hardware-in-the-loop test harness (no board flashing, no UART/pyserial automation).
- Not a side-channel / power-trace analysis tool (3.9 in the report is referenced but not
  simulated numerically — it's surfaced only as a qualitative note).
- Not a network stack implementation — fragmentation/loss modeling is probabilistic/analytic,
  not packet-level simulation (no LoRaSim/QEMU integration in v1).

## 4. Source-of-truth data (from the literature review)

### 4.1 Reference device profiles

| Profile ID | Board | CPU | RAM | Flash | Clock | Notes |
|---|---|---|---|---|---|---|
| `cw308-stm32f3` | ChipWhisperer CW308-STM32F3 | Cortex-M4 | 40 KB | 256 KB | — | Extreme constraint stress-test target; ML-DSA easily exhausts RAM |
| `nucleo-l476rg` | NUCLEO-L476RG | Cortex-M4 | 128 KB | 1 MB | — | Realistic Class-1 baseline; supports ML-KEM + ML-DSA without off-chip memory |
| `stm32f4-disco` | STM32F4 Discovery | Cortex-M4 | 192 KB | 1 MB | up to 168 MHz | De facto pqm4 reference platform |
| `rp2040` | Raspberry Pi Pico RP2040 | dual Cortex-M0+ | 264 KB SRAM | 2 MB QSPI | 133 MHz | No DSP/SIMD; worst-case instruction-set benchmark |
| `nucleo-l4r5zi` | NUCLEO-L4R5ZI | Cortex-M4 | 640 KB | 2 MB | — | Default pqm4 board for largest ML-DSA/SLH-DSA sets |

### 4.2 Algorithm benchmark anchors (measured on Cortex-M0+ @133 MHz unless noted)

| Algorithm | Operation | Time | Peak stack | Energy | Signature/key/ct size |
|---|---|---|---|---|---|
| ML-KEM-512 | Full handshake | 35.7 ms | 9.4 KB | 2.83 mJ | pk 800 B |
| ML-KEM-768 | Full handshake | 56.6 ms | 14.2 KB | 4.48 mJ | — |
| ML-KEM-1024 | Full handshake | 85.7 ms | — | — | — |
| ECDH P-256 (classical) | Key agreement | 606.0 ms | — | 48.9 mJ | ~32–64 B |
| ML-DSA-44 | Sign (mean) | 158.9 ms (CV 67.5%, p99 489.9 ms) | 50.6 KB | ~12.5 mJ | 2,420 B |
| ML-DSA-65 | Sign (mean) | 256.6 ms | 77.6 KB | ~20.3 mJ | — |
| ML-DSA-87 | Sign (mean) | 355.2 ms (p99 1,125.0 ms) | 119.6 KB | ~28.1 mJ | 4,627 B |
| ECDSA P-256 (classical) | Sign | — | — | ~39.4 mJ/cycle | ~32–64 B |
| SLH-DSA-128s | Sign/verify | — (heavy) | — | — | 7,856 B |
| LMS H25 | Verify (firmware use) | fast (SHA-256-based) | small | low | ~1,116 B |

Cortex-M4 (with DSP/SIMD, UMULL/SMULL) is modeled as **~1.8×–1.9× faster** than Cortex-M0+
for the same algorithm (derived from the M0+ slowdown factor stated in the report).

### 4.3 Network model constants (IEEE 802.15.4 / 6LoWPAN)

- 802.15.4 MTU: **127 bytes**
- Effective 6LoWPAN payload per frame: **~81 bytes** (single hop) down to **~45 bytes**
  (multi-hop, heavier header stack)
- ML-DSA-44 signature (2,420 B) → **~30–50 fragments**
- Any single lost fragment ⇒ whole datagram dropped ⇒ full retransmit (6LoWPAN has no
  partial-reassembly recovery)
- Effective handshake success probability = `(1 - p_loss) ^ n_fragments` (independent-loss
  approximation, explicitly labeled as a simplification in the UI)

### 4.4 Minimum Workable Configuration (MWC) rule

Derived from §8 of the report, encoded as a decision rule (not a hard simulation):

- CPU: 32-bit Cortex-M0+ or better, ≥48 MHz → **required** for any PQC algorithm.
- ML-KEM only (no local signing): RAM ≥ 64 KB total (≥16 KB dedicated crypto RAM).
- ML-KEM + ML-DSA (full agility): RAM ≥ 128 KB total.
- Flash: ≥512 KB minimum, ≥1 MB recommended (dual-partition OTA).
- Below these thresholds the tool reports **Infeasible**; within ~20% headroom of a threshold
  it reports **Marginal**; otherwise **Reliable**.

## 5. System architecture

```
                    ┌─────────────────────────┐
                    │   benchmark-data/*.json │   ← literature-sourced, versioned, cited
                    └────────────┬────────────┘
                                 │
                    ┌────────────────────────┐
                    │   estimation-core (TS)  │   pure functions, no I/O
                    │  - deviceModel.ts       │
                    │  - algoModel.ts         │
                    │  - networkModel.ts      │
                    │  - mwcRules.ts          │
                    └──────┬──────────┬───────┘
                           │          │
                 ┌─────────┘          └─────────┐
                 ▼                               ▼
        ┌─────────────────┐             ┌─────────────────┐
        │   CLI (Node)     │             │   Web app (SPA)  │
        │  pqc-iot-sim     │             │  single HTML     │
        │  commands        │             │  artifact/page   │
        └─────────────────┘             └─────────────────┘
```

- **estimation-core** is the single shared engine (interpolation/extrapolation math, MWC
  classification, network fragmentation math). Both front ends call the same functions so
  results are always consistent.
- **benchmark-data** is plain JSON/TS data tables mirroring §4.1–4.3 above, each entry tagged
  with its literature citation number (e.g. `"source": "report §5.1, note 15"`) so the UI can
  show provenance, and so updating a number later is a one-line data edit, not a code change.
- Custom/user-added devices run through the same core but use a clearly-labeled extrapolation
  path (scaling anchors by clock/RAM ratio) rather than the exact reference numbers.

## 6. Functional scope — Web app

1. **Device Library** — table/cards of the 5 reference boards + any user-added custom boards
   (name, CPU family, RAM, flash, clock, radio). Add/edit/delete custom devices, stored
   client-side.
2. **Simulator** — pick device + algorithm + security level + (optional) network link →
   outputs a result panel: time, stack RAM, flash, energy, MWC verdict, and — for signing
   algorithms — the rejection-sampling variance chart (mean/CV/p95/p99).
3. **Compare view** — put 2–4 device/algorithm combinations side by side (e.g. ML-KEM-512 on
   RP2040 vs STM32F4 Discovery vs classical ECDH).
4. **Network overhead panel** — given a message (key/signature) size and link type, show
   fragment count, effective payload, and handshake success probability at a chosen loss rate.
5. **Report / literature page** — renders the methodology summary (the 10 benchmarking
   techniques, the 5 device profiles, the MWC derivation) as readable, citeable content inside
   the app, so a reader doesn't need the source PDFs open.
6. **Export** — download current comparison as CSV/JSON for use elsewhere.

## 7. Functional scope — CLI

Mirrors the web app 1:1 on the same data/engine:

```
pqc-iot-sim devices list
pqc-iot-sim devices add --name myboard --ram 96 --flash 512 --clock 64 --cpu cortex-m0+
pqc-iot-sim simulate --device rp2040 --algo ml-kem-512
pqc-iot-sim simulate --device nucleo-l476rg --algo ml-dsa-65 --signing-runs 1000
pqc-iot-sim network --algo ml-dsa-44 --link 802.15.4 --hops 1 --loss 0.02
pqc-iot-sim compare --device rp2040,stm32f4-disco --algo ml-kem-512
pqc-iot-sim report --format md > report.md
pqc-iot-sim export --format csv --out results.csv
```

Output formats: human-readable table (default), `--json`, `--csv`.

## 8. Data model (shared types)

```ts
interface DeviceProfile {
  id: string;
  name: string;
  cpu: "cortex-m0+" | "cortex-m4" | "cortex-m7" | "custom";
  ramKB: number;
  flashKB: number;
  clockMHz: number;
  hasDSP: boolean;        // SIMD/UMULL-SMULL availability
  radio?: "802.15.4" | "lora" | "wifi" | "none";
  isReference: boolean;   // true for the 5 literature boards
  source?: string;        // citation, omitted for custom devices
}

interface AlgoProfile {
  id: string;             // "ml-kem-512", "ml-dsa-87", ...
  family: "kem" | "signature";
  securityLevel: 1 | 3 | 5;
  reference: {
    deviceId: string;     // which board the anchor numbers came from
    timeMs: number;
    cvPercent?: number;   // signatures only
    p99Ms?: number;       // signatures only
    stackKB: number;
    energyMJ: number;
    payloadBytes: number; // key or signature size
  };
}

interface SimulationResult {
  device: DeviceProfile;
  algo: AlgoProfile;
  estimatedTimeMs: number;
  estimatedStackKB: number;
  estimatedEnergyMJ: number;
  mwcVerdict: "reliable" | "marginal" | "infeasible";
  isExtrapolated: boolean;
}

interface NetworkResult {
  payloadBytes: number;
  effectivePayloadPerFrame: number; // 81 or 45
  fragmentCount: number;
  successProbability: number;
  link: "802.15.4" | "lora";
}
```

## 9. Two deliverables this design implies

- **`01-DESIGN.md`** (this file) — what the system is and why.
- **`02-IMPLEMENTATION.md`** — how to build it: stack choices, folder layout, build order,
  milestones, and the literature-report content outline for the in-app report page.
