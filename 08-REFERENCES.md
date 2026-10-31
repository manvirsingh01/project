# PQC-on-IoT Simulator — References & Sources

Companion to `01-DESIGN.md` through `07-STATES-DASHBOARD.md`. This file consolidates every
source the project's data and claims rest on, every standard the simulator models, every
external tool/framework referenced from the literature (not integrated, but cited), and the
technology the app itself is built with — so any number or design choice in the other seven
files can be traced to the source detail available in this checkout. The original brief and
research report are not included, so some external citation groups cannot be mapped to an
individual benchmark value and their full URLs are unavailable.

## 1. Primary project sources

| Source | Role in this project |
|---|---|
| *Project brief* ("Untitled document") | Defines the project scope and benchmarking goals: execution time, memory, energy, communication overhead, reliability, minimum workable configuration — directly shapes `01-DESIGN.md` §2 and the metrics catalog in `05-BENCHMARKING.md` §1.4 |
| *"Post-Quantum Cryptography in Resource-Constrained IoT: Minimum Viable Architectures and Benchmarking Methodologies"* (the research report) | Source of every anchor number in `benchmark-data/*.json`: device profiles, ML-KEM/ML-DSA timings, stack/energy figures, network constants, and the ten benchmarking methodologies encoded in `05-BENCHMARKING.md` §1.1 |

## 2. Cryptographic standards modeled

| Standard | Algorithm | Where it's used in this project |
|---|---|---|
| FIPS 203 | ML-KEM (derived from CRYSTALS-Kyber) | Key-encapsulation benchmarks, `01-DESIGN.md` §4.2 |
| FIPS 204 | ML-DSA (derived from CRYSTALS-Dilithium) | Signature benchmarks + rejection-sampling variance model, §4.2 and `05-BENCHMARKING.md` §1.3 |
| FIPS 205 | SLH-DSA (derived from SPHINCS+) | Referenced for signature-size comparison (7,856 B), not numerically benchmarked — marked `unsupported` tier |
| FIPS 206 | FN-DSA (derived from Falcon) | Referenced in the report as an agility option; not currently in the simulator's algorithm catalog — candidate for a future milestone |
| RFC 8554 / NIST SP 800-208 | LMS (Leighton-Micali stateful hash-based signatures) | Firmware-verification use case, §7 of the report; signature-size anchor (~1,116 B for LMS H25) |
| RFC 8391 | XMSS (eXtended Merkle Signature Scheme) | Same firmware-verification context, alternative stateful hash-based scheme |

## 3. External research tools and frameworks referenced (cited, not integrated)

These appear in the source report as the tools used to *produce* the original benchmark data.
The simulator does not run or depend on any of them — it reuses their published results. Each
is listed here so the project's methodology section (`05-BENCHMARKING.md` §1.1) is traceable
to the actual research infrastructure it's modeling.

| Tool | Purpose in the source research | Simulator's relationship to it |
|---|---|---|
| pqm4 | Standardized PQC benchmarking suite for ARM Cortex-M4 | Source of most device/algorithm anchor numbers; not integrated — no board flashing or live execution in this project |
| mupq | Shared PQC benchmarking harness underlying pqm4 and related tools | Same — cited for provenance only |
| QEMU (5.2) | Emulates ARM Cortex-M for stack-usage profiling without physical hardware | Cited in `05-BENCHMARKING.md` §1.1 (methodology #5) as the origin of stack figures; not used by this project directly |
| pqriscv | Cycle-accurate RISC-V simulation for PQC | Cited for context on hardware/software co-design; out of scope per `01-DESIGN.md` §3 |
| LoRaSim | Discrete-event network simulator for LPWAN | Cited as the origin of network-layer modeling concepts; this project's own network math (`02-IMPLEMENTATION.md` §3.4) is a simplified analytic model, not a LoRaSim integration |

## 4. Works cited (from the source research report)

Reproduced here as a bibliographic index only — titles and venues, no quoted text. Citation
groups are transcribed from the source report; some individual works and full URLs cannot be
verified from the files in this checkout. The References view includes a source crosswalk and
marks these limits rather than guessing an anchor-to-paper association.

1. NIST Post-Quantum Cryptography Standards — IEEE Xplore
2. Post-Quantum Cryptography for Resource-Constrained IoT and Edge Devices: A No-Std Rust
   Implementation Framework — ResearchGate
3. Benchmarking Post-Quantum Cryptography on Resource-Constrained IoT Devices: ML-KEM and
   ML-DSA on ARM Cortex-M0 — ResearchGate
4–5, 7, 13–17, 24, 26. Benchmarking NIST-Standardised ML-KEM and ML-DSA on ARM / pqm4
   benchmarking papers (arXiv, IACR ePrint, csrc.nist.gov, kannwischer.eu) — primary source of
   the cycle/stack/energy anchor figures used throughout this project
6, 22. Quantum-Resistant Cybersecurity Mechanisms for Next-Generation IoT; Evaluating
   Post-Quantum Cryptography in IoT Networks — journal/NSF-hosted sources on network-level
   fragmentation and reliability
8. Side-Channel and Fault Attacks on ML-KEM and ML-DSA — conference slide deck (PROACT 2025);
   basis for marking side-channel benchmarking out of scope in `01-DESIGN.md` §3
9. Towards ML-KEM & ML-DSA on OpenTitan — cryptojedi.org
10. Post-quantum crypto on ARM Cortex-M — cryptojedi.org; early source on 8/16-bit architecture
    infeasibility, basis for the `attiny-avr`/`msp430fr` entries in `06-DEVICE-CATALOG.md` §1
11. Constant-Time Symmetry Exploitation for NTT Twiddle Factors in ML — basis for the
    NTT/twiddle-factor discussion in `05-BENCHMARKING.md` §1.1 (methodology #4)
12. mupq/pqm4 GitHub repository — primary source for the five reference device profiles in
    `01-DESIGN.md` §4.1
18. Small Devices: D1.6 Final Implementations — pqcrypto.eu.org
19. HORCRUX: A Complete PQC RISC-V eXtension Architecture — arXiv; basis for marking
    hardware/software co-design (ATP/FPGA/ASIC) out of scope
20. LoRaWAN Meets ML: A Survey on Enhancing Performance with Machine Learning — ResearchGate
21, 27, 29–30. IEEE 802.15.4 / 6LoWPAN fragmentation sources (ResearchGate, Texas Instruments,
   PMC/NIH) — basis for the 127-byte MTU, 81/45-byte effective payload, and VRB-overflow
   discussion in `02-IMPLEMENTATION.md` §3.4 and `03-PLAYGROUND.md` §6
23. A Constraint-Aware Taxonomy of Lightweight Cryptography for IoT — IEEE Xplore
25. Evaluation of NIST-standardized ML-KEM, ML-DSA and SLH-DSA — PLOS ONE
28. Post-Quantum Cryptography (PQC) and Network Connectivity — postquantum.com
31–34. XMSS and LMS Deployment / Comparison of Stateful Hash-Based Signature Schemes
   (quantumsecuritydefence.com, quantumsequrity.com, sopmac.de, ResearchGate) — basis for the
   firmware-verification architecture discussion in `02-IMPLEMENTATION.md` §6 item 8

*(Full URLs are preserved in the original source report; omitted here to keep this index
readable — cross-reference by citation number against the report's own "Works cited" section
when a URL is needed.)*

## 5. Technology used to build the app itself

Distinct from §2–4 (what the app *models*), this section lists what the app is *built with* —
referenced across `02-IMPLEMENTATION.md`, `03-PLAYGROUND.md`, and `06-DEVICE-CATALOG.md`.

| Technology | Used for | Referenced in |
|---|---|---|
| JavaScript ES modules | Shared `core/` estimation engine and data model; TypeScript is mentioned in planning docs but is not used in the current repository | `core/`, `benchmark-data/` |
| Node.js | CLI runtime and built-in test runner | `cli/`, `tests/`, `package.json` |
| HTML/CSS/vanilla JS | Static browser app; React is not integrated | `web/` |
| Inline SVG | Comparison and dashboard charts; Chart.js is not integrated | `web/app.js`, `07-STATES-DASHBOARD.md` |
| `localStorage` (browser, wrapped in try/catch) | Per-browser convenience storage for custom devices | `02-IMPLEMENTATION.md` §4, `03-PLAYGROUND.md` §5 |
| JavaScript data modules | Source-tagged benchmark and reference records; planning notes describe JSON files, but the repository uses ES modules | `benchmark-data/` |
| Built-in client-side PDF generation | Matrix and dashboard PDF export without a PDF package or backend | `core/deviceCatalog.js` |
| `node:test` | Core, data, CLI, and static web tests | `tests/`, `package.json` |
| JSON Lines (`.jsonl`) | CLI run-history log | `05-BENCHMARKING.md` §4.3 |

## 6. Internal document map

For navigating the project's own documentation set:

| File | Covers |
|---|---|
| `01-DESIGN.md` | System definition, literature data tables, architecture, data model |
| `02-IMPLEMENTATION.md` | Tech stack, repo layout, build plan, report-page outline, milestones |
| `03-PLAYGROUND.md` | Animated device-swap/connection screen |
| `04-TESTING.md` | Three-layer test plan (data / engine / surface), acceptance checklist |
| `05-BENCHMARKING.md` | Full methodology detail, caching architecture, alerting rules |
| `06-DEVICE-CATALOG.md` | Extended low-RAM device set, full state matrix, PDF export design |
| `07-STATES-DASHBOARD.md` | Consolidated one-page view of all tables, charts, and detail |
| `08-REFERENCES.md` *(this file)* | Every source, standard, cited tool, and build technology |

## 7. How to keep this file current

- Any new anchor value added to `benchmark-data/*.json` must carry a `source` field (per
  `05-BENCHMARKING.md` §4.2) that resolves to an entry in §4 above — if it doesn't match an
  existing citation, add the new source to §4 in the same change.
- Any new standard, algorithm, or external tool referenced in the Report tab content
  (`02-IMPLEMENTATION.md` §6) should get a row in §2 or §3 here.
- Any new library/dependency added to the actual codebase should get a row in §5, including
  *why* it was chosen, so a future contributor can evaluate whether it's still the right choice.
