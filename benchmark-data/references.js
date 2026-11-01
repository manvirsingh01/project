export const projectSources = [
  { name: "Project brief (Untitled document)", role: "Project scope and benchmark goals: execution time, memory, energy, communication overhead, reliability, and minimum workable configurations.", availability: "Referenced by the design notes; the original brief is not included in this checkout." },
  { name: "Post-Quantum Cryptography in Resource-Constrained IoT: Minimum Viable Architectures and Benchmarking Methodologies", role: "Research report cited as the origin of device, algorithm, stack, energy, network, and methodology inputs.", availability: "The report is not included in this checkout. Exact anchor-to-paper mapping and full URLs are unavailable here." }
];

export const standards = [
  { id: "FIPS 203", name: "ML-KEM (derived from CRYSTALS-Kyber)", role: "Key-encapsulation benchmark context; design §4.2." },
  { id: "FIPS 204", name: "ML-DSA (derived from CRYSTALS-Dilithium)", role: "Signature benchmark and rejection-sampling variance context; design §4.2 and benchmarking §1.3." },
  { id: "FIPS 205", name: "SLH-DSA (derived from SPHINCS+)", role: "Signature-size comparison; timing is unsupported in the supplied anchors." },
  { id: "FIPS 206", name: "FN-DSA (derived from Falcon)", role: "Mentioned as an agility option in the reference notes; not included in the simulator catalog." },
  { id: "RFC 8554 / NIST SP 800-208", name: "LMS stateful hash-based signatures", role: "Firmware-verification context and LMS H25 signature-size anchor." },
  { id: "RFC 8391", name: "XMSS stateful hash-based signatures", role: "Alternative stateful scheme cited for firmware verification; not currently modeled." }
];

export const researchTools = [
  { name: "pqm4", role: "ARM Cortex-M4 PQC benchmarking suite; cited as a source of literature measurements.", integration: "Not integrated; this app does not flash or run boards." },
  { name: "mupq", role: "PQC benchmarking harness associated with pqm4 and related research.", integration: "Not integrated; cited for provenance only." },
  { name: "QEMU 5.2", role: "ARM Cortex-M emulation cited in relation to stack profiling.", integration: "Not used by this project." },
  { name: "pqriscv", role: "Cycle-accurate RISC-V simulation cited in the hardware/software co-design context.", integration: "Out of scope; not used by this project." },
  { name: "LoRaSim", role: "LPWAN discrete-event simulation cited as background for network modeling.", integration: "Not integrated; the project uses its own analytic fragmentation/loss model." },
  { name: "Wokwi", role: "Browser-based microcontroller and peripheral simulator for illustrative firmware execution.", integration: "Local RP2040 and ATtiny85 stub projects are included; timing is not cryptographic or silicon-accurate, and no iframe embed is claimed." }
];

export const worksCited = [
  { numbers: "1", title: "NIST Post-Quantum Cryptography Standards", venue: "IEEE Xplore" },
  { numbers: "2", title: "Post-Quantum Cryptography for Resource-Constrained IoT and Edge Devices: A No-Std Rust Implementation Framework", venue: "ResearchGate listing" },
  { numbers: "3", title: "Benchmarking Post-Quantum Cryptography on Resource-Constrained IoT Devices: ML-KEM and ML-DSA on ARM Cortex-M0", venue: "ResearchGate listing" },
  { numbers: "4–5, 7, 13–17, 24, 26", title: "Benchmarking NIST-standardized ML-KEM and ML-DSA on ARM / pqm4 benchmarking papers", venue: "Grouped sources: arXiv, IACR ePrint, NIST CSRC, and kannwischer.eu; primary timing/stack/energy source group" },
  { numbers: "6, 22", title: "Quantum-Resistant Cybersecurity Mechanisms for Next-Generation IoT; Evaluating Post-Quantum Cryptography in IoT Networks", venue: "Journal / NSF-hosted listings; network reliability context" },
  { numbers: "8", title: "Side-Channel and Fault Attacks on ML-KEM and ML-DSA", venue: "PROACT 2025 conference slide deck; scope context" },
  { numbers: "9", title: "Towards ML-KEM & ML-DSA on OpenTitan", venue: "cryptojedi.org" },
  { numbers: "10", title: "Post-quantum crypto on ARM Cortex-M", venue: "cryptojedi.org; small-architecture context" },
  { numbers: "11", title: "Constant-Time Symmetry Exploitation for NTT Twiddle Factors in ML", venue: "NTT/twiddle-factor methodology context" },
  { numbers: "12", title: "mupq/pqm4 repository", venue: "GitHub; reference-board context" },
  { numbers: "18", title: "Small Devices: D1.6 Final Implementations", venue: "pqcrypto.eu.org" },
  { numbers: "19", title: "HORCRUX: A Complete PQC RISC-V eXtension Architecture", venue: "arXiv; hardware/software co-design scope" },
  { numbers: "20", title: "LoRaWAN Meets ML: A Survey on Enhancing Performance with Machine Learning", venue: "ResearchGate listing" },
  { numbers: "21, 27, 29–30", title: "IEEE 802.15.4 / 6LoWPAN fragmentation sources", venue: "ResearchGate, Texas Instruments, and PMC/NIH listings; frame and fragmentation context" },
  { numbers: "23", title: "A Constraint-Aware Taxonomy of Lightweight Cryptography for IoT", venue: "IEEE Xplore" },
  { numbers: "25", title: "Evaluation of NIST-standardized ML-KEM, ML-DSA and SLH-DSA", venue: "PLOS ONE" },
  { numbers: "28", title: "Post-Quantum Cryptography (PQC) and Network Connectivity", venue: "postquantum.com" },
  { numbers: "31–34", title: "XMSS and LMS deployment / comparison of stateful hash-based signature schemes", venue: "Grouped listings: quantumsecuritydefence.com, quantumsequrity.com, sopmac.de, and ResearchGate" }
];

export const sourceCrosswalk = [
  { field: "01-DESIGN.md §4.1", entries: "Five reference-board profiles", references: "Citation 12 (mupq/pqm4 repository)", note: "The report does not provide a finer board-field mapping in this checkout." },
  { field: "01-DESIGN.md §4.2", entries: "Algorithm time, stack, energy, and payload anchors", references: "Grouped citations 4–5, 7, 13–17, 24, 26; selected classical and qualitative claims are also transcribed from the design table", note: "The grouped entries do not identify which paper supports each individual number." },
  { field: "01-DESIGN.md §4.3", entries: "802.15.4 / 6LoWPAN framing and loss assumptions", references: "Citations 21, 27, 29–30; network reliability context also cites 6 and 22", note: "The simulator's 51-byte LoRa default is explicitly a configurable assumption, not a cited standard constant." },
  { field: "01-DESIGN.md §4.4", entries: "Minimum Workable Configuration thresholds", references: "Research report §8, as cited by the design notes", note: "The underlying report and exact bibliography mapping are unavailable here." },
  { field: "06-DEVICE-CATALOG.md §1", entries: "Extended low-RAM device profiles and excluded architecture rationale", references: "Project catalog; citation 10 is cited for 8/16-bit architecture infeasibility", note: "The catalog does not provide separate hardware datasheet citations for each profile." }
];

export const technologies = [
  { name: "Node.js + native ES modules", usage: "CLI and shared core runtime.", status: "Used" },
  { name: "HTML, CSS, and vanilla JavaScript", usage: "Static browser app; no React or runtime UI framework.", status: "Used" },
  { name: "Inline SVG", usage: "Comparison, dashboard, and variance charts.", status: "Used" },
  { name: "localStorage", usage: "Browser custom-device profiles.", status: "Used" },
  { name: "JavaScript benchmark data module", usage: "Source-tagged device, algorithm, network, and reference records in benchmark-data/.", status: "Used; upstream notes propose JSON files, but this repo uses an ES module." },
  { name: "Built-in PDF writer", usage: "Client-side and CLI PDF generation without a runtime dependency.", status: "Used" },
  { name: "node:test", usage: "Data, core, CLI, and web-surface tests.", status: "Used" },
  { name: "Wokwi project files", usage: "Optional RP2040 and ATtiny85 illustrative dummy-workload sketches with phase LEDs and serial output.", status: "Used; no PQC library is linked" },
  { name: "TypeScript", usage: "Mentioned by the design notes for a typed engine.", status: "Not integrated; current source is JavaScript." },
  { name: "React / Chart.js", usage: "Optional approaches mentioned in the source notes.", status: "Not integrated; current app uses vanilla JavaScript and SVG." },
  { name: "External runtime packages", usage: "Application dependencies.", status: "None; the project uses built-in platform APIs." }
];

export const documentMap = [
  ["01-DESIGN.md", "System definition, literature data tables, architecture, and data model"],
  ["02-IMPLEMENTATION.md", "Stack, repository layout, build plan, report outline, and milestones"],
  ["03-PLAYGROUND.md", "Animated device-swap and network connection screen"],
  ["04-TESTING.md", "Data, engine, and surface test plan"],
  ["05-BENCHMARKING.md", "Benchmark methods, caching, confidence, and alerts"],
  ["06-DEVICE-CATALOG.md", "Extended low-RAM device set, comparison matrix, and PDF export"],
  ["07-STATES-DASHBOARD.md", "Consolidated device/algorithm matrix, charts, and state details"],
  ["08-REFERENCES.md", "Primary sources, standards, research tools, bibliography index, and technology map"],
  ["09-DATA-EXPORT.md", "Operation-level CSV/JSON and numbers-only PDF dataset export"],
  ["10-REAL-PQC-PIPELINE.md", "Real-hardware firmware, collector, and measured-live result pipeline"],
  ["11-WOKWI-SIMULATION.md", "Wokwi-supported board mappings, illustrative projects, and Hardware Sim view"]
];
