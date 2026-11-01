# PQC-on-IoT Simulator — Wokwi Integration

This document describes the local Wokwi CLI bridge and illustrative firmware protocol. It complements `10-REAL-PQC-PIPELINE.md`; virtual results remain distinct from physical `measured-live` data.

Wokwi simulates firmware and peripherals but does not provide cycle-accurate physical timing. The two committed sketches still run dummy arithmetic loops. They do not link a PQC library, execute cryptographic operations, or produce physical performance measurements. Their telemetry is labeled `simulated-illustrative` with timer source `wokwi-virtual`.

## 1. Why add this

The earlier Playground (`03-PLAYGROUND.md`) animates an abstract node-and-link diagram driven
entirely by pre-computed numbers — nothing is actually executing. Wokwi closes that gap: it
lets a learner actually see a microcontroller boot, run a sketch that calls into a PQC library,
blink status LEDs per operation phase, and print timing to a serial monitor — all inside the
browser, no account or hardware required, directly embedded in this project.

## 2. Mapping the device catalog to Wokwi-supported boards

Wokwi supports a specific set of boards/chips. Not every device in
`06-DEVICE-CATALOG.md` has a Wokwi equivalent — this is mapped honestly, not forced:

| Catalog device | Wokwi board available? | Notes |
|---|---|---|
| `rp2040` (Raspberry Pi Pico) | **Yes** — documented `wokwi-pi-pico` | Same board family; project uses an illustrative stub, not PQC |
| `stm32l031` | Closest equivalent: documented `board-st-nucleo-l031k6` | Same MCU family on a different Nucleo board; mapping is shown as approximate and has no bundled sketch |
| `stm32f4-disco`, `nucleo-l476rg`, `nucleo-l4r5zi`, `cw308-stm32f3` | No exact mapped board in the documented board list used here | Hardware Sim reports unavailable rather than substituting a different MCU |
| `nrf51822`, `stm32l053`, `msp430fr` | No mapped board in the documented board list used here | Remain available in the estimator and exports, not the Wokwi project list |
| `attiny-avr` | **Yes** — documented `wokwi-attiny85` | Representative AVR part; not an exact mapping for the ATtiny/ATmega device class |

A board with no Wokwi equivalent still works everywhere else in the project (Simulator,
Dashboard, exports) — the Wokwi tab is additive, never a requirement.

## 3. Firmware and telemetry

The RP2040 and ATtiny85 sketches toggle phase LEDs around dummy workloads and emit one JSON object per serial line. Protocol v1 events carry a monotonically increasing sequence number, board identity, algorithm label, operation, elapsed microseconds, and `timerSource: "wokwi-virtual"`. The `implementation` field is `stub`.

These operation labels identify the demonstration workload only. No KAT or host-reference result is emitted, because no PQC implementation is linked. The bridge therefore imports results only as `simulated-illustrative`; it cannot promote them to `wokwi-executed` or `measured-live`.

## 4. File layout addition

```
wokwi-projects/
├── rp2040/
│   ├── diagram.json      # Pico + 3 LEDs (keygen/encaps/decaps) + resistors
│   ├── main.cpp
│   └── wokwi.toml
├── attiny-avr/
│   ├── diagram.json
│   ├── main.ino
│   └── wokwi.toml
└── README.md              # project notes
```

## 5. Local bridge and Hardware Sim

The static browser cannot launch a local process. Run `npm run realtime` in a second terminal beside `npm run start`. The bridge binds to `127.0.0.1:8787` and allows only the built-in `rp2040` and `attiny-avr` project IDs. It invokes `wokwi-cli` with a fixed project path and `shell: false`; browser requests cannot provide executable names or filesystem paths.

The bridge exposes health, start-session, session status, SSE events, stop, and raw-log endpoints. Sessions are limited to three active runs, Wokwi simulation timeout is bounded, and the raw log is capped at 1 MB. The browser Hardware Sim view starts and stops sessions, displays JSONL events, stores operation results in the existing separate illustrative store, and offers raw-log download. Manual legacy serial import remains available.

`WOKWI_CLI_TOKEN` may be required by Wokwi CLI. Keep it in the local process environment; it is never sent to browser code or committed to the repository. Wokwi CLI and PlatformIO must be installed and the selected firmware built before a run can start.

## 7. Data handling and labeling

- Any reading captured from a Wokwi session is stored, if the user chooses to keep it, with
  `data_source: "simulated-illustrative"` — following the exact same ingestion pattern as
  `measured-live` in `10-REAL-PQC-PIPELINE.md` §6, but in its own store, never merged with
  `measured-live` physical-hardware data. The Compare/Dashboard views can show it as a fourth
  series, visually distinct (different color/pattern) from the other three tiers.
- The Report tab / Method page gets one explicit paragraph: *"Hardware Sim readings come from
  Wokwi's browser-based simulator. They demonstrate real code execution and real peripheral
  behavior, but Wokwi does not claim cycle-accurate timing fidelity to physical silicon —
  treat these numbers as illustrative, not as a benchmark result."*

## 8. Tests

Automated tests validate JSONL event parsing, device and algorithm identity, increasing sequence numbers, timing values, fixed project allow-listing, bounded timeout inputs, and structured session forwarding. Browser tests confirm that the Hardware Sim surface includes the live stream controls. Actual Wokwi execution still requires the external CLI and a built firmware image.

## 9. Milestones

| Milestone | Status |
|---|---|
| M13 — local Wokwi projects | Included, with dummy firmware and structured telemetry; builds need PlatformIO validation |
| M14 — live local bridge | Implemented: allow-listed runner, session APIs, SSE, logs, browser controls |
| M15 — mapping completion | Existing mapping retained; only RP2040 and ATtiny85 have bundled projects |
| M16 — actual PQC in Wokwi | Not implemented; requires selecting and pinning a vetted library and passing KATs |
| M17 — physical hardware | Not implemented; requires attached board, toolchain, and verified harness |

## 10. Current repository integration

`tools/wokwi-bridge/` contains the JSONL parser, session manager, and loopback HTTP/SSE server. Start it with `npm run realtime`. The static app remains a separate process. `benchmark-data/wokwi.js` is the project allow-list source context; the bridge independently hard-codes the two safe project paths.

No local Wokwi or PlatformIO binary is available in the development environment, so firmware builds, diagram lint, and a live CLI run could not be verified here. No PQC library has been downloaded or linked. Network packet modeling, physical-board serial transport, memory instrumentation, and physical energy measurement remain separate roadmap work and are not claimed by this integration.
