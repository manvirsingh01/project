# PQC-on-IoT Simulator

A small browser app and Node CLI for exploring literature-based post-quantum cryptography projections on constrained IoT hardware. The browser includes a network Playground with swappable sender/receiver profiles, an optional relay, animated exchange and fragment flow, and MWC feedback. This is a modeling tool; it does not implement cryptographic primitives or run operations on hardware.

An optional Hardware Sim view links local Wokwi RP2040 and ATtiny85 stub projects to serial-output import. These execute dummy workloads for educational peripheral/firmware flow only; their timings are not PQC benchmarks.

## Run locally

Requires Node.js 18+. There are no npm runtime dependencies.

```sh
npm run start
```

Open the URL printed by the server; it prefers `http://127.0.0.1:8001/` and the project root redirects to the app. The browser UI saves custom profiles in local storage.

For live Wokwi serial events, run `npm run realtime` in a second terminal. The web server prefers port 8001 and automatically tries the next 20 ports if it is occupied; it prints the selected URL. The local bridge binds only to `127.0.0.1:8787`, starts only the allow-listed RP2040 and ATtiny85 projects, and requires Wokwi CLI plus built firmware. Current sketches are stubs; their JSONL timings are illustrative and are not PQC or physical-board results.

Run the CLI directly:

```sh
node cli/pqc-iot-sim.js help
node cli/pqc-iot-sim.js devices list
node cli/pqc-iot-sim.js matrix
node cli/pqc-iot-sim.js matrix --export pdf --out devices-report.pdf --algo ml-kem-512 --metric energy
node cli/pqc-iot-sim.js states --algo ml-kem --device-type catalog
node cli/pqc-iot-sim.js export --out pqc-iot-data.csv
node cli/pqc-iot-sim.js export --format pdf --numbers-only --out pqc-iot-data.pdf
node cli/pqc-iot-sim.js references
node cli/pqc-iot-sim.js simulate --device rp2040 --algo ml-kem-512
node cli/pqc-iot-sim.js measured import --file board-run.json
node cli/pqc-iot-sim.js measured list --json
node cli/pqc-iot-sim.js network --algo ml-dsa-44 --link 802.15.4 --hops 1 --loss 0.02
node cli/pqc-iot-sim.js compare --device rp2040,stm32f4-disco --algo ml-kem-512 --json
node cli/pqc-iot-sim.js report --format md
```

The Wokwi project sources are in `wokwi-projects/`. Build a project with PlatformIO (`pio run`)
from its directory, then run it with Wokwi for VS Code or `wokwi-cli .` (Wokwi CLI setup may
require a Wokwi CI token). The browser opens a blank board editor; copy the included sketch and
diagram there to run it online. Paste serial rows into Hardware Sim to compare them separately.

`npm link` makes `pqc-iot-sim` available as a local command. Custom CLI profiles are stored in `~/.pqc-iot-sim/custom-devices.json`; the browser and CLI profiles are separate by design.

Real-hardware results that pass both the on-device KAT and host reference check can be imported with `measured import`; the CLI stores them under `~/.pqc-iot-sim/measured-results.json`. The browser accepts the same JSON from the Simulator view and stores it in local storage. Imported values are tagged `measured-live` and shown separately from modeled estimates. The firmware harness and serial collector described in `10-REAL-PQC-PIPELINE.md` still require a target board, toolchain, and vetted PQC library.

## Tests

Run `npm test` for data, core estimation, CLI, and browser-surface checks. Browser interaction tests are included and run when Playwright is installed; without it, the browser integration case is skipped while the static web checks still run. Run `npm run check` for JavaScript syntax checks.

The benchmark cache is capped at 500 in-process results. CLI runs may persist results under `~/.pqc-iot-sim/cache.json`; use `--no-cache` for a fresh calculation. `pqc-iot-sim --version` reports application, data, and engine versions. Use `simulate --record` and `history` to track runs. CLI alerts are returned in JSON; `--strict` promotes warnings to exit code 1. A webhook is only contacted when `--webhook URL` is explicitly supplied to a batch comparison.

## Project map

- `core/index.js` contains the shared projection, MWC, and network functions.
- `benchmark-data/index.js` holds the source-tagged data used by both front ends. `null` means the supplied notes contain no numeric value.
- `benchmark-data/references.js` maintains the standards, research-source groups, build-technology status, and document crosswalk shown on the combined Method & sources page.
- `core/deviceCatalog.js` builds per-device algorithm results, the MWC state matrix, and the shared PDF report used by the browser and CLI.
- `core/dataExport.js` builds the shared operation-level dataset and serializes it as flat CSV/JSON or a numbers-only paginated PDF.
- The States dashboard consolidates the live matrix, projections, network fragmentation, variance, and per-cell details in one view; matching CLI filters are available through `states`.
- `web/` contains the browser interface and interactions.
- `cli/` contains the Node command line.
- `01-DESIGN.md` and `02-IMPLEMENTATION.md` are the specification inputs.

## Model limits

Time scales linearly from Cortex-M0+ @133 MHz anchors; Cortex-M4/M7 performance uses the documented 1.85× factor. Unknown reference clock speeds use a labeled 133 MHz assumption. Stack is copied from the available anchor, and energy scales only when both time and energy anchors exist. Network loss assumes independent packet loss. LoRa frame capacity defaults to a configurable 51-byte modeling assumption because the supplied notes do not specify one. Read **Method & sources** in the web app for details and the MWC rule.

The repository contains a grouped numbered reference index, but not the original source report, source PDFs, full bibliography URLs, or anchor-level paper mapping. The combined Method & sources page flags those limits instead of guessing missing citations.
