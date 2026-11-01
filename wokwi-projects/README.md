# Wokwi illustrative projects

Both projects use dummy arithmetic loops. They do not link a PQC library, implement cryptography,
or produce useful performance estimates. Firmware emits protocol-v1 JSON Lines events; timings use
the `wokwi-virtual` timer label and must not be treated as physical measurements.

## Run locally

Install PlatformIO and Wokwi CLI / VS Code integration, then from a project directory:

```sh
pio run
wokwi-cli .
```

Wokwi CLI may require `WOKWI_CLI_TOKEN`. Run `npm run start` and `npm run realtime` in separate
terminals; Hardware Sim can then start only these local projects and stream their events. Manual
comma-separated serial import remains available for older logs.

## Projects

- `rp2040/`: Pico, labeled ML-KEM-512; keygen, encapsulate, decapsulate phase LEDs.
- `attiny-avr/`: ATtiny85 representative, labeled ML-DSA-44; keygen, sign, verify phase LEDs.

Each label identifies the educational workload only. No implementation of those algorithms is
present in the firmware.
