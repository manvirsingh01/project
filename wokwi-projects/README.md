# Wokwi illustrative projects

Both projects use dummy arithmetic loops. They do not link a PQC library, implement cryptography,
or produce useful performance estimates. Serial lines use `operation,elapsed_ms` and LEDs indicate
the active phase.

## Run locally

Install PlatformIO and Wokwi CLI / VS Code integration, then from a project directory:

```sh
pio run
wokwi-cli .
```

Wokwi CLI may require a CI token. The Hardware Sim view opens a blank Wokwi board template; copy
the project's sketch and `diagram.json` there, run it, and paste the serial output into the view.

## Projects

- `rp2040/`: Pico, labeled ML-KEM-512; keygen, encapsulate, decapsulate phase LEDs.
- `attiny-avr/`: ATtiny85 representative, labeled ML-DSA-44; keygen, sign, verify phase LEDs.

Each label identifies the educational workload only. No implementation of those algorithms is
present in the firmware.
