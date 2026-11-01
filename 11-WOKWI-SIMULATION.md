# PQC-on-IoT Simulator — In-Browser Hardware Simulation with Wokwi

Companion to `01-DESIGN.md` through `10-REAL-PQC-PIPELINE.md`. `10-REAL-PQC-PIPELINE.md`
covers measuring real PQC on a physical board on your bench. This file covers the middle
ground: using **Wokwi** (wokwi.com), a browser-based electronics/microcontroller simulator, so
anyone can watch a device-shaped simulation actually run code, wire up components, and print
real serial output — without owning the hardware — and see that embedded directly in this
project's web app.

**Scope boundary, stated up front (same discipline as every other file in this set):** Wokwi
simulates instruction execution and peripherals, not cycle-accurate silicon timing. It is a
genuinely useful **illustrative and educational** layer — real code actually runs, real serial
output actually prints — but its timing is not a substitute for either the literature anchors
in `01-DESIGN.md` or the physical-hardware `measured-live` data in
`10-REAL-PQC-PIPELINE.md`. Every number Wokwi produces in this project is labeled
`simulated-illustrative`, a fourth, clearly distinct tier alongside `literature-anchor`,
`extrapolated`, and `measured-live`.

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

## 3. What actually runs inside the simulation

- A small sketch (Arduino-style `.ino` or PlatformIO `main.cpp`, depending on the board) that:
  1. Links a lightweight PQC implementation suitable for the simulated chip — reuse the same
     library choice as `10-REAL-PQC-PIPELINE.md` §3 (liboqs/pqm4) where a build target exists
     for the simulated architecture; for boards where that's not practical inside Wokwi's
     toolchain, use a clearly-labeled **stub** that times a representative dummy computation
     (e.g. a fixed number of modular-multiplication-shaped operations) rather than a real
     ML-KEM/ML-DSA call, so the "is this real?" question always has an honest answer per board.
  2. Toggles a wired LED per operation phase (key generation / encapsulation / signing, etc.),
     giving a physical-looking visual cue, not just a serial log line.
  3. Prints `operation,elapsed_ms` lines to the simulated serial port as each phase completes.
- A `diagram.json` circuit: the board plus one LED per tracked phase (and a resistor each),
  wired to GPIO pins — simple, legible, not a dense breadboard.
- A `wokwi.toml` project config pointing at the sketch and diagram, per Wokwi's project format.

## 4. File layout addition

```
wokwi-projects/
├── rp2040/
│   ├── diagram.json      # Pico + 3 LEDs (keygen/encaps/decaps) + resistors
│   ├── main.cpp
│   └── wokwi.toml
├── stm32-generic/
│   ├── diagram.json
│   ├── main.cpp
│   └── wokwi.toml
├── attiny-avr/
│   ├── diagram.json
│   ├── main.ino
│   └── wokwi.toml
└── README.md              # which real_or_stub library each project uses, and why
```

## 5. Embedding in the web app

- New tab: **Hardware Sim**, alongside Playground, using Wokwi's embeddable simulator (an
  `<iframe>` pointed at a Wokwi project, using Wokwi's public embedding support) — no backend
  needed, consistent with the project's no-server design (`02-IMPLEMENTATION.md` §2).
- Device dropdown mirrors the Devices tab, but only offers devices with a Wokwi mapping (§2);
  unsupported devices show the "not available in Wokwi" message rather than being hidden
  entirely, so the catalog stays visibly complete.
- Algorithm dropdown mirrors the Simulator tab, filtered to whichever operations the selected
  board's project actually implements.
- **Live data bridge**: Wokwi's serial output is captured via its embed messaging interface and
  parsed for the `operation,elapsed_ms` lines described in §3; as each line arrives, the
  corresponding LED's state and a small on-page readout update together — so the browser-side
  UI and the simulated board's own LED stay visually synchronized, not just two separate
  displays of the same data.
- A **side-by-side comparison panel** shows, for the current selection: literature anchor time,
  extrapolated/measured-live time if available (from earlier files), and the
  `simulated-illustrative` time just observed — three numbers, three clearly different labels,
  never merged into one.

## 6. Configuring the device inside Wokwi

- "Open in Wokwi" button opens the full Wokwi editor (new tab) with the exact same project,
  so a user can edit wiring, swap components, or modify the sketch directly in Wokwi's own
  full-featured environment — this project doesn't reimplement a wiring editor; it embeds and
  defers to Wokwi's for anything beyond the basic view.
- Changes made in the full Wokwi editor are **not** synced back into this project's own
  `wokwi-projects/` automatically (that would require a Wokwi account/API write-back scope
  beyond this plan's purpose) — the embedded view always reflects this project's committed
  version; "Open in Wokwi" is explicitly a fork-off point for exploration, not a shared live
  edit session.
- A "Reset to default wiring" control reloads the embedded project from the committed
  `diagram.json`, undoing any in-session tinkering in the embedded (not the full-editor)
  view.

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

| Test | Expectation |
|---|---|
| Embedded Wokwi iframe loads for `rp2040` | simulation boots, serial output begins printing within a reasonable timeout |
| Selecting a device with no Wokwi mapping (`cw308-stm32f3`) | Hardware Sim tab shows the "not available" message, no broken iframe |
| LED state in the embedded view | matches the most recently parsed serial `operation` line — i.e., if serial says `encapsulate` just completed, the encapsulate LED is the one lit, not a stale one |
| Captured `simulated-illustrative` reading | never overwrites or is displayed merged with a `literature-anchor`, `extrapolated`, or `measured-live` value for the same cell — always a clearly separate, labeled entry |
| "Reset to default wiring" | reloads the embedded view to the committed `diagram.json`, discarding any in-session edits in that embedded view only |
| Report tab | contains the §7 disclosure paragraph verbatim-equivalent, so the limitation is never silently dropped from user-facing text |

## 9. Milestones

Extends `10-REAL-PQC-PIPELINE.md` §8:

| Milestone | Scope | Exit criteria |
|---|---|---|
| M13 — Wokwi project set | `wokwi-projects/rp2040` (and `attiny-avr`, since both have strong native Wokwi support) with diagram, sketch, phase LEDs, serial output | Both projects boot and print `operation,elapsed_ms` lines correctly when run directly in Wokwi's own editor |
| M14 — Web embed | Hardware Sim tab, iframe embed, serial parsing bridge, side-by-side comparison panel | §8 tests pass; unsupported devices degrade gracefully instead of erroring |
| M15 — Catalog mapping completion | Extend the §2 mapping table to cover as much of `06-DEVICE-CATALOG.md`'s device list as Wokwi genuinely supports | Mapping table in §2 reflects Wokwi's current board list, rechecked, no device falsely marked supported |

## 10. Current repository integration

The repository includes local PlatformIO/Wokwi projects for RP2040 and ATtiny85, a Hardware Sim
view, and a parser that stores captured rows separately as `simulated-illustrative`. The bundled
firmware uses dummy arithmetic loops; no PQC library is linked and these readings are not
cryptographic measurements. The view links to Wokwi's blank board editor, where the included
sketch and diagram can be copied, and accepts serial output pasted from that session.

The iframe bridge in §5 is deferred. Wokwi's published embed example currently describes itself
as an unsupported prototype, and its `experimental/embed` endpoint needs a client ID and uploaded
project files. This checkout has neither published Wokwi project IDs nor an approved embed client
ID, so it does not claim a working embedded simulator or automatic serial capture. The local
projects can be run through Wokwi for VS Code / CLI. Current board mapping lives in
`benchmark-data/wokwi.js`; it lists documented Pico, ATtiny85, and NUCLEO-L031K6 board support,
with only the first two having included sketches.
