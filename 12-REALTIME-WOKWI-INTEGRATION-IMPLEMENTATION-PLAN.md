# PQC-on-IoT Simulator — Real-Time Wokwi Integration & Implementation Plan

## 1. Project Objective

The objective is to transform the existing PQC-on-IoT Simulator into a hybrid, real-time interactive testbed that combines:

1. Literature-based PQC performance estimation.
2. Wokwi-based virtual microcontroller execution.
3. Actual PQC algorithm execution using a vetted cryptographic library.
4. Real-time serial communication and telemetry.
5. Physical IoT hardware benchmarking.
6. Network simulation with realistic latency, packet loss, fragmentation and retransmission.
7. Live comparison between estimated, simulated and physically measured results.

The system must clearly distinguish between virtual simulation and actual physical hardware measurements.

### 1.1 Target execution modes

| Mode | Execution environment | Purpose | Data label |
|---|---|---|---|
| Model simulation | Existing JavaScript engine | Literature-based estimation | `literature-anchor`, `extrapolated` |
| Wokwi illustrative | Virtual microcontroller | Firmware and peripheral testing using dummy workloads | `simulated-illustrative` |
| Wokwi PQC execution | Virtual microcontroller running actual PQC firmware | Functional PQC integration testing | `wokwi-executed` |
| Physical hardware | Actual microcontroller | Real PQC performance benchmarking | `measured-live` |

**Important:** Wokwi execution is not equivalent to physical hardware benchmarking. Its virtual timing must never be presented as actual device performance.

---

## 2. Existing Project Architecture

The existing repository already contains:

- `core/index.js` — estimation and network simulation engine.
- `core/wokwi.js` — Wokwi-related logic.
- `core/measuredResults.js` — measured-result validation and import.
- `benchmark-data/wokwi.js` — supported Wokwi board mapping.
- `wokwi-projects/rp2040/` — RP2040 simulation project.
- `wokwi-projects/attiny-avr/` — ATtiny85 simulation project.
- `10-REAL-PQC-PIPELINE.md` — physical PQC benchmarking plan.
- `11-WOKWI-SIMULATION.md` — Wokwi integration documentation.

The existing Wokwi firmware uses dummy arithmetic loops. It does not currently link a PQC library.

The new implementation must extend these components rather than replace the existing simulator.

---

## 3. Proposed System Architecture

```text
                  PQC-on-IoT Web Dashboard
                            |
             +--------------+--------------+
             |              |              |
          Model          Wokwi          Hardware
        Simulation     Simulation       Testing
             |              |              |
             |              v              |
             |        Wokwi CLI Runner      |
             |              |              |
             |        Virtual MCU           |
             |              |              |
             |        Serial Events         |
             |              |              |
             +--------------+--------------+
                            |
                     Local Node.js Bridge
                            |
                   Event Processing Layer
                            |
               +------------+------------+
               |            |            |
            Timing       Memory       Network
            Metrics      Metrics      Metrics
               |            |            |
               +------------+------------+
                            |
                    Result Validation
                            |
             +--------------+--------------+
             |              |              |
         Literature      Wokwi         Physical
          Results       Results        Results
             |              |              |
             +--------------+--------------+
                            |
                  Live Comparison Dashboard
                            |
                  CSV / JSON / PDF Reports
```

---

## 4. Real-Time Wokwi Integration

### 4.1 Objective

Integrate Wokwi directly into the local simulator workflow so that users can:

- Start a virtual microcontroller.
- Execute firmware.
- View serial output.
- Monitor operation progress.
- Observe GPIO and LED changes.
- Receive live execution events.
- Export simulation results.
- Compare virtual execution with literature estimates.

The recommended first integration uses the Wokwi CLI and a local Node.js bridge.

Do not depend on an undocumented iframe messaging interface.

### 4.2 Required tools

| Tool | Purpose |
|---|---|
| Wokwi | Virtual hardware simulation |
| Wokwi CLI | Start and control simulations |
| PlatformIO | Firmware compilation |
| Node.js | Local integration server |
| Python | Optional analysis and data processing |
| Serial communication | Firmware telemetry |
| SSE | Live browser updates |
| PQClean/liboqs | Actual PQC implementation where supported |

Official documentation:

- https://docs.wokwi.com/wokwi-ci/cli-usage
- https://docs.wokwi.com/vscode/platformio
- https://docs.wokwi.com/vscode/project-config
- https://docs.wokwi.com/guides/serial-monitor
- https://docs.wokwi.com/getting-started/supported-hardware

### 4.3 Recommended directory structure

```text
project/
│
├── core/
│   ├── index.js
│   ├── wokwi.js
│   ├── measuredResults.js
│   └── realtimeEngine.js
│
├── benchmark-data/
│   ├── index.js
│   ├── wokwi.js
│   └── references.js
│
├── firmware/
│   ├── common/
│   │   ├── protocol.h
│   │   ├── protocol.cpp
│   │   ├── benchmark_runner.h
│   │   ├── benchmark_runner.cpp
│   │   └── telemetry.h
│   │
│   ├── adapters/
│   │   ├── rp2040/
│   │   └── attiny85/
│   │
│   └── libraries/
│       └── README.md
│
├── wokwi-projects/
│   ├── rp2040/
│   │   ├── diagram.json
│   │   ├── main.cpp
│   │   ├── platformio.ini
│   │   └── wokwi.toml
│   │
│   └── attiny-avr/
│       ├── diagram.json
│       ├── main.ino
│       ├── platformio.ini
│       └── wokwi.toml
│
├── tools/
│   └── wokwi-bridge/
│       ├── server.js
│       ├── runner.js
│       ├── parser.js
│       └── sessionManager.js
│
├── web/
│   ├── app.js
│   └── styles.css
│
├── artifacts/
│   ├── wokwi/
│   └── hardware/
│
└── tests/
    ├── wokwi.test.js
    ├── realtime.test.js
    └── hardware.test.js
```

---

## 5. Configure Wokwi Projects

### 5.1 RP2040 configuration

File:

`wokwi-projects/rp2040/wokwi.toml`

```toml
[wokwi]
version = 1
firmware = ".pio/build/pico/firmware.uf2"
elf = ".pio/build/pico/firmware.elf"
```

Verify the generated firmware filenames after building with PlatformIO.

Build:

```bash
cd wokwi-projects/rp2040
pio run
```

Run:

```bash
wokwi-cli .
```

### 5.2 ATtiny85 configuration

File:

`wokwi-projects/attiny-avr/wokwi.toml`

```toml
[wokwi]
version = 1
firmware = ".pio/build/attiny85/firmware.hex"
elf = ".pio/build/attiny85/firmware.elf"
```

Build:

```bash
cd wokwi-projects/attiny-avr
pio run
```

Run:

```bash
wokwi-cli .
```

ATtiny85 has no built-in hardware UART, so use an appropriate software serial implementation and verify its pin mapping in the Wokwi diagram.

### 5.3 Circuit design

The RP2040 virtual circuit should contain:

- Raspberry Pi Pico.
- Status LED for key generation.
- Status LED for encapsulation.
- Status LED for decapsulation.
- Resistors.
- Ground connections.
- Serial communication.

Suggested circuit layout:

```text
                Raspberry Pi Pico
              +-------------------+
              |                   |
              | GP15 ---- LED 1   |
              | GP14 ---- LED 2   |
              | GP13 ---- LED 3   |
              |                   |
              | USB Serial        |
              |                   |
              +-------------------+
                       |
                 Serial Monitor
```

Use the Wokwi editor to validate actual part IDs and pin connections.

---

## 6. Firmware Implementation

### 6.1 Firmware responsibilities

The firmware should:

1. Initialize the microcontroller.
2. Identify the board and firmware version.
3. Initialize the selected PQC library.
4. Execute known-answer tests.
5. Execute the selected PQC operation.
6. Measure execution time using a board-appropriate timer.
7. Collect available memory information.
8. Send structured telemetry through serial.
9. Update GPIO indicators.
10. Report the final run status.

### 6.2 Common firmware interface

Create:

`firmware/common/benchmark_runner.h`

```cpp
#ifndef BENCHMARK_RUNNER_H
#define BENCHMARK_RUNNER_H

#include <stdint.h>

struct BenchmarkResult {
    const char* algorithm;
    const char* operation;

    uint32_t elapsed_us;
    uint32_t stack_bytes;

    bool kat_passed;
    bool execution_success;
};

void benchmark_initialize();

bool benchmark_run_kat(const char* algorithm);

BenchmarkResult benchmark_execute(
    const char* algorithm,
    const char* operation
);

#endif
```

This is an interface outline. Implement the board timer, stack measurement and PQC calls separately for each supported target.

### 6.3 Timer implementation

Do not assume that every microcontroller has the same timer or cycle counter.

For each board, record:

- Timer source.
- Counter frequency.
- Clock configuration.
- Counter resolution.
- Counter overflow handling.

For RP2040, use an appropriate hardware timer or SDK timing function.

For ATtiny85, use a documented timer/counter configuration.

The firmware should report microseconds or counter ticks with the actual frequency.

### 6.4 LED operation indicators

Suggested phase mapping:

| Operation | LED | Meaning |
|---|---|---|
| Initialization | Blue | Firmware boot |
| KAT | Yellow | Correctness verification |
| Key generation | Green | Key generation executing |
| Encapsulation | Orange | Encapsulation executing |
| Decapsulation | Purple | Decapsulation executing |
| Error | Red | Operation failed |
| Completion | Green blink | Run completed |

LED indicators must reflect actual firmware events, not independently animated browser timers.

---

## 7. Structured Serial Communication

### 7.1 Why JSON Lines?

The current serial format:

```text
operation,elapsed_ms
```

is too limited for a full real-time benchmarking system.

Use JSON Lines, with one JSON object per line.

Each event should include:

- Session ID.
- Sequence number.
- Board identity.
- Firmware version.
- Firmware build hash.
- Algorithm.
- Operation.
- Timer source.
- Measurement.
- Status.

### 7.2 Example serial events

```json
{
  "protocolVersion": 1,
  "sessionId": "run-001",
  "sequence": 1,
  "event": "hello",
  "source": "wokwi",
  "deviceId": "rp2040",
  "board": "raspberry-pi-pico",
  "clockHz": 133000000,
  "firmwareVersion": "0.2.0"
}
```

KAT event:

```json
{
  "protocolVersion": 1,
  "sessionId": "run-001",
  "sequence": 2,
  "event": "kat_result",
  "algorithmId": "ml-kem-512",
  "passed": true
}
```

Operation result:

```json
{
  "protocolVersion": 1,
  "sessionId": "run-001",
  "sequence": 3,
  "event": "operation_result",
  "algorithmId": "ml-kem-512",
  "operation": "encapsulate",
  "iteration": 1,
  "elapsedUs": 1234,
  "timerSource": "wokwi-virtual",
  "stackBytes": null
}
```

These values are illustrative examples, not actual benchmark measurements.

### 7.3 Important validation rules

- Sequence numbers must increase.
- Unknown events must be rejected.
- Malformed JSON must not crash the collector.
- Failed KATs must invalidate the run.
- Private keys must never be transmitted in telemetry.
- Missing measurements must remain null.
- The timer source must always be recorded.

---

## 8. Actual PQC Algorithm Integration

### 8.1 Objective

The current Wokwi firmware uses dummy workloads.

Replace those workloads with actual PQC operations wherever the selected library and target architecture support them.

Recommended algorithms:

| Algorithm | Purpose |
|---|---|
| ML-KEM-512 | Key encapsulation |
| ML-KEM-768 | Higher security-level comparison |
| ML-DSA-44 | Digital signatures |
| ML-DSA-65 | Signature comparison |

### 8.2 Library selection

| Library | Purpose |
|---|---|
| PQClean | Portable implementations of PQC algorithms |
| liboqs | PQC library with multiple algorithms |
| pqm4 | ARM Cortex-M optimized PQC implementations |

Choose a library version and pin its exact commit.

Do not assume that every implementation will compile on every microcontroller.

For the RP2040:

1. Select a portable implementation.
2. Check available compiler and architecture support.
3. Build the implementation for the target.
4. Measure flash and RAM requirements.
5. Execute KATs.
6. Run the selected operations.

For ATtiny85:

1. Inspect available flash and SRAM.
2. Determine whether the selected implementation fits.
3. Check compiler support and required dependencies.
4. Attempt a build only after a footprint review.
5. Report unsupported operations honestly.

Do not force an algorithm onto a board if its memory or toolchain cannot support it.

### 8.3 KAT validation

Before timing any PQC operation:

```text
Firmware Boot
     |
Library Initialization
     |
Load Known Test Vector
     |
Execute PQC Operation
     |
Compare Expected Output
     |
   +---+---+
   |       |
 PASS     FAIL
   |       |
 Run      Reject
 Benchmark Run
```

A failed KAT must prevent the run from being accepted as a PQC benchmark.

A successful KAT is a correctness check, not a security certification.

---

## 9. Wokwi CLI and Local Node.js Bridge

### 9.1 Why a local bridge?

A static browser page cannot directly launch Wokwi CLI or access arbitrary local serial ports.

A local Node.js bridge is needed to:

- Start the approved Wokwi project.
- Capture serial logs.
- Parse firmware events.
- Stream updates to the browser.
- Store session results.
- Stop running simulations.

### 9.2 Start a Wokwi simulation

Example:

```bash
wokwi-cli wokwi-projects/rp2040 \
  --timeout 60000 \
  --serial-log-file artifacts/wokwi/rp2040-session.jsonl
```

Use the documented CLI options supported by the installed version.

Wokwi CLI may require a Wokwi CI token.

Set it through an environment variable:

```bash
export WOKWI_CLI_TOKEN="YOUR_TOKEN"
```

Never commit the token to GitHub or expose it in browser JavaScript.

### 9.3 Node.js bridge API

Recommended endpoints:

| Endpoint | Purpose |
|---|---|
| GET `/api/health` | Check local bridge status |
| POST `/api/wokwi/sessions` | Start simulation |
| GET `/api/wokwi/sessions/:id` | Read session status |
| GET `/api/wokwi/sessions/:id/events` | Stream live events |
| POST `/api/wokwi/sessions/:id/stop` | Stop simulation |
| GET `/api/wokwi/sessions/:id/log` | Download raw serial log |

Only allow predefined project IDs.

Never allow the browser to execute arbitrary commands or supply arbitrary filesystem paths.

Use `child_process.spawn()` with fixed executable paths and `shell: false`.

### 9.4 Live browser communication

Use Server-Sent Events (SSE).

```text
Firmware
   |
Serial Output
   |
Wokwi CLI
   |
Node.js Bridge
   |
Event Parser
   |
SSE Connection
   |
Browser Dashboard
```

The browser should update:

- Current operation.
- KAT status.
- Iteration count.
- Latest execution measurement.
- Live event log.
- LED state.
- Session completion status.

If the browser disconnects, the simulation should remain associated with its session and allow the user to reconnect.

---

## 10. Physical Hardware Integration

Wokwi integration should use the same firmware protocol as physical hardware.

Only the transport adapter should change.

| Component | Wokwi | Physical board |
|---|---|---|
| Execution | Virtual MCU | Real MCU |
| Transport | Wokwi serial log | USB/UART |
| Timing | Virtual timer | Actual device timer |
| Memory | Virtual firmware telemetry | Actual board telemetry |
| Energy | Not physical measurement | External power instrument |
| Result label | `wokwi-executed` | `measured-live` |

### 10.1 Hardware connection workflow

```text
Connect Board
     |
Detect Serial Port
     |
Read Firmware Identity
     |
Verify Board and Clock
     |
Run KAT
     |
Host Reference Check
     |
Run Benchmark
     |
Collect Telemetry
     |
Validate Result
     |
Import measured-live
```

### 10.2 Hardware measurement

Collect:

- Execution time.
- Flash size.
- Static RAM.
- Stack high-water mark.
- Heap usage, if available.
- CPU clock.
- Compiler version.
- Optimization flags.
- Firmware hash.
- PQC library commit.
- Supply voltage.
- Energy consumption, when measured with an external instrument.

For energy measurement, use a calibrated current/voltage monitor or power analyzer.

Calculate:

\[
E = \int_{t_0}^{t_1} V(t)I(t)\,dt
\]

If no physical power instrument is connected, keep energy as null.

Do not estimate physical energy from Wokwi timing.

---

## 11. Realistic IoT Network Simulation

### 11.1 Objective

Improve the current network Playground so it models more realistic IoT communication behavior.

The network engine should support:

- Packet fragmentation.
- Packet loss.
- Burst loss.
- Network latency.
- Jitter.
- Retransmission.
- Timeout.
- Packet reassembly.
- MTU limits.
- Queue depth.
- Congestion.
- Communication overhead.

### 11.2 Network simulation architecture

```text
              Sender Device
                   |
              PQC Operation
                   |
             Message Creation
                   |
             Packet Fragmenter
                   |
             Network Emulator
                   |
        +----------+----------+
        |          |          |
      Delay      Loss       Jitter
        |          |          |
        +----------+----------+
                   |
              Receiver
                   |
             Packet Reassembly
                   |
            Message Validation
                   |
              ACK / NACK
                   |
             Retransmission
```

### 11.3 Network configuration

| Parameter | Description |
|---|---|
| MTU | Maximum packet size |
| Latency | Transmission delay |
| Jitter | Variation in latency |
| Packet loss | Probability of packet loss |
| Burst loss | Consecutive packet-loss behavior |
| Retry limit | Maximum retransmissions |
| Timeout | ACK waiting period |
| Fragmentation | Splitting large messages |
| Reassembly | Reconstructing the original message |
| Queue size | Maximum buffered packets |

Use a seeded random number generator so that experiments can be repeated.

Record the seed and network configuration for every experiment.

### 11.4 Real wireless validation

For actual radio testing, connect physical radio modules and capture:

- Packet transmission time.
- Packet reception time.
- RSSI.
- SNR.
- Packet loss.
- Retransmissions.
- Payload size.
- Power consumption.

Do not claim that a simulated serial connection represents actual LoRa, BLE or IEEE 802.15.4 radio behavior.

---

## 12. Result Storage and Data Validation

Keep the four data sources separate.

Suggested Wokwi result structure:

```json
{
  "schemaVersion": 1,
  "data_source": "wokwi-executed",
  "sessionId": "run-001",
  "timestamp": "2026-11-01T00:00:00.000Z",
  "deviceFingerprint": {
    "id": "rp2040",
    "name": "Raspberry Pi Pico",
    "cpu": "cortex-m0+",
    "clockMHz": 133,
    "firmwareBuildHash": "sha256:...",
    "library": "PQClean",
    "libraryCommit": "pinned-commit"
  },
  "simulation": {
    "provider": "Wokwi",
    "timerSource": "wokwi-virtual"
  },
  "algorithmId": "ml-kem-512",
  "operation": "encapsulate",
  "katPassed": true,
  "referenceCheckPassed": true,
  "measurement": {
    "runCount": 20,
    "virtualMeanUs": 1234,
    "virtualP95Us": 1290,
    "stackBytes": null,
    "freeHeapBytes": null,
    "energyMJ": null
  }
}
```

The numbers above are placeholders.

### Validation requirements

1. Validate schema version.
2. Verify board identity.
3. Verify firmware build hash.
4. Verify algorithm and operation.
5. Verify KAT status.
6. Verify host-reference status.
7. Reject invalid or negative measurements.
8. Preserve missing metrics as null.
9. Keep Wokwi data separate from physical data.
10. Preserve the raw serial log.

---

## 13. Dashboard Improvements

Add a new Real-Time Hardware section to the existing dashboard.

### 13.1 Main dashboard components

| Component | Function |
|---|---|
| Device selector | Select RP2040 or ATtiny85 |
| Execution selector | Select Wokwi or physical hardware |
| Algorithm selector | Select supported PQC algorithm |
| Operation selector | Keygen, encapsulate, decapsulate, sign, verify |
| Run button | Start execution |
| Stop button | Stop active execution |
| Connection indicator | Display device/bridge connection |
| KAT indicator | Show correctness status |
| Serial monitor | Display firmware output |
| Event timeline | Display operation progress |
| Live chart | Display incoming measurements |
| Comparison panel | Compare model and execution results |
| Export button | Download experiment data |

### 13.2 Real-time comparison

The dashboard should show:

| Metric | Literature | Wokwi | Physical |
|---|---|---|---|
| Execution time | Estimate | Virtual time | Measured |
| Stack | Reference | If available | Measured |
| Flash | Reference | Build artifact | Build artifact |
| RAM | Reference | If available | Measured |
| Energy | Estimate/reference | Not physical | Instrument measurement |
| KAT | Source-dependent | Test result | Test result |

Never merge these into one average.

---

## 14. Implementation Roadmap

Implement the project incrementally.

| Milestone | Implementation | Expected outcome |
|---|---|---|
| M16 | Improve Wokwi projects | Valid PlatformIO and Wokwi configurations |
| M17 | JSONL firmware protocol | Structured serial telemetry |
| M18 | Local Node.js bridge | Automatic Wokwi execution and serial capture |
| M19 | SSE integration | Live browser updates |
| M20 | Actual PQC integration | PQC firmware executes in Wokwi where supported |
| M21 | Physical board connection | Real board serial collection |
| M22 | Memory and energy collection | Improved resource measurement |
| M23 | Network emulator | Realistic packet-level simulation |
| M24 | Experiment validation | Research-quality comparison and reports |

### 14.1 Recommended implementation order

#### Phase 1 — Wokwi integration

- Verify RP2040 project.
- Verify ATtiny85 project.
- Add Wokwi configuration files.
- Validate circuit diagrams.
- Run Wokwi CLI.
- Capture serial output.

#### Phase 2 — Real-time communication

- Create JSONL protocol.
- Create Node.js bridge.
- Add event parser.
- Add SSE connection.
- Connect browser dashboard.
- Add session management.

#### Phase 3 — PQC integration

- Select PQC library.
- Pin library version.
- Compile ML-KEM-512.
- Execute KATs.
- Implement key generation.
- Implement encapsulation.
- Implement decapsulation.
- Add signature algorithms after validating the first workflow.

#### Phase 4 — Physical hardware

- Connect RP2040.
- Reuse the same firmware harness.
- Collect serial telemetry.
- Verify KAT.
- Verify host reference.
- Collect timing and memory.
- Add external energy measurement.

#### Phase 5 — Network realism

- Implement packet fragmentation.
- Add latency and jitter.
- Add packet-loss models.
- Add retransmission.
- Add timeout and reassembly.
- Export network traces.

#### Phase 6 — Research validation

- Repeat experiments.
- Compare estimates with actual measurements.
- Calculate statistical distributions.
- Document hardware differences.
- Publish reproducible experiment configurations.

---

## 15. Testing and Validation

| Test | Expected result |
|---|---|
| RP2040 PlatformIO build | Successful compilation |
| ATtiny85 PlatformIO build | Successful compilation |
| Wokwi diagram lint | No invalid connections |
| Wokwi CLI run | Simulation starts |
| Serial parser | Valid JSONL events parsed |
| KAT failure | Benchmark rejected |
| Reference mismatch | Benchmark rejected |
| Browser disconnect | Session can reconnect |
| CLI timeout | Session marked as failed |
| Unsupported device | Clear unsupported message |
| Invalid project ID | Bridge rejects request |
| Wokwi result import | Stored separately |
| Physical result import | KAT/reference validation required |
| Missing power instrument | Energy remains null |
| Repeated network simulation | Same seed reproduces outcomes |

Run existing project tests:

```bash
npm test
```

Run syntax checks:

```bash
npm run check
```

Run Wokwi-specific tests:

```bash
npm run test:wokwi
```

---

## 16. Security and Reliability

- Use vetted PQC implementations.
- Do not write cryptographic primitives from scratch.
- Pin library versions.
- Run KATs before timing.
- Never store private keys in logs.
- Use ephemeral benchmark keys.
- Keep Wokwi tokens out of source control.
- Bind the local bridge to `127.0.0.1`.
- Use an allow-list of approved projects.
- Never execute arbitrary browser-supplied commands.
- Validate serial input.
- Limit session runtime and log size.
- Preserve failed sessions for debugging.
- Keep physical hardware control local.
- Never use benchmark firmware as production security firmware without a separate security review.

---

## 17. Expected Final System

After completing the roadmap, the project should provide:

1. Literature-based PQC performance estimates.
2. Interactive Wokwi virtual hardware execution.
3. Actual PQC code execution in Wokwi where supported.
4. Live serial telemetry.
5. Automatic result collection.
6. Physical microcontroller integration.
7. Actual execution-time measurement.
8. Runtime memory and stack measurement.
9. External energy measurement.
10. Realistic IoT network simulation.
11. Packet fragmentation and retransmission analysis.
12. Comparison between theoretical and measured results.
13. Exportable experiment data.
14. Reproducible benchmark reports.

---

## 18. Definition of Done

### Live Wokwi integration

The project can claim live Wokwi integration when:

- A user starts a supported simulation.
- Firmware executes in the virtual MCU.
- Serial events are captured automatically.
- The browser updates while the simulation runs.
- Raw logs and parsed results can be exported.

### Actual PQC execution

The project can claim Wokwi PQC execution only when:

- A vetted PQC implementation is linked.
- The selected algorithm really executes.
- KATs pass.
- Host-reference comparison passes.
- The result is labelled `wokwi-executed`.

### Real hardware benchmarking

The project can claim real hardware benchmarking only when:

- A physical microcontroller is connected.
- The firmware executes the selected PQC operation.
- KAT and reference checks pass.
- Repeated measurements are collected.
- Device and firmware identity are recorded.
- Timing and memory measurement methods are documented.
- Energy is measured using a physical instrument when reported.

**Final principle:** Wokwi should make the firmware workflow interactive and testable; physical hardware should establish actual performance. The simulator should preserve both results alongside literature estimates without confusing their meaning.
