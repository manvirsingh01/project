// Benchmark values transcribed from 01-DESIGN.md. null means the source did not
// provide a numeric anchor; it is intentionally not replaced with a guess.
export const DATA_VERSION = "1.2.0";
export const devices = [
  { id: "cw308-stm32f3", name: "ChipWhisperer CW308-STM32F3", cpu: "cortex-m4", ramKB: 40, flashKB: 256, clockMHz: null, hasDSP: true, radio: "none", isReference: true, source: "01-DESIGN.md §4.1" },
  { id: "nucleo-l476rg", name: "NUCLEO-L476RG", cpu: "cortex-m4", ramKB: 128, flashKB: 1024, clockMHz: null, hasDSP: true, radio: "none", isReference: true, source: "01-DESIGN.md §4.1" },
  { id: "stm32f4-disco", name: "STM32F4 Discovery", cpu: "cortex-m4", ramKB: 192, flashKB: 1024, clockMHz: 168, hasDSP: true, radio: "none", isReference: true, source: "01-DESIGN.md §4.1" },
  { id: "rp2040", name: "Raspberry Pi Pico RP2040", cpu: "cortex-m0+", ramKB: 264, flashKB: 2048, clockMHz: 133, hasDSP: false, radio: "none", isReference: true, source: "01-DESIGN.md §4.1" },
  { id: "nucleo-l4r5zi", name: "NUCLEO-L4R5ZI", cpu: "cortex-m4", ramKB: 640, flashKB: 2048, clockMHz: null, hasDSP: true, radio: "none", isReference: true, source: "01-DESIGN.md §4.1" },
  { id: "stm32l031", name: "STM32L031 (ultra-low-power)", cpu: "cortex-m0+", ramKB: 8, flashKB: 32, clockMHz: 32, hasDSP: false, radio: "none", isReference: false, source: "06-DEVICE-CATALOG.md §1" },
  { id: "nrf51822", name: "nRF51822 (BLE SoC)", cpu: "cortex-m0", ramKB: 16, flashKB: 256, clockMHz: 16, hasDSP: false, radio: "BLE", isReference: false, source: "06-DEVICE-CATALOG.md §1" },
  { id: "stm32l053", name: "STM32L053", cpu: "cortex-m0+", ramKB: 8, flashKB: 64, clockMHz: 32, hasDSP: false, radio: "none", isReference: false, source: "06-DEVICE-CATALOG.md §1" },
  { id: "attiny-avr", name: "ATtiny/ATmega-class (8-bit AVR)", cpu: "avr-8bit", ramKB: 2, flashKB: 32, clockMHz: 16, hasDSP: false, radio: "none", isReference: false, source: "06-DEVICE-CATALOG.md §1" },
  { id: "msp430fr", name: "MSP430FR5969", cpu: "msp430-16bit", ramKB: 2, flashKB: 64, clockMHz: 16, hasDSP: false, radio: "none", isReference: false, source: "06-DEVICE-CATALOG.md §1" }
];

export const algorithms = [
  { id: "ml-kem-512", name: "ML-KEM-512", family: "kem", level: 1, timeMs: 35.7, stackKB: 9.4, energyMJ: 2.83, payloadBytes: 800, cvPercent: null, p99Ms: null, source: "01-DESIGN.md §4.2; M0+ @133 MHz" },
  { id: "ml-kem-768", name: "ML-KEM-768", family: "kem", level: 3, timeMs: 56.6, stackKB: 14.2, energyMJ: 4.48, payloadBytes: null, cvPercent: null, p99Ms: null, source: "01-DESIGN.md §4.2; M0+ @133 MHz" },
  { id: "ml-kem-1024", name: "ML-KEM-1024", family: "kem", level: 5, timeMs: 85.7, stackKB: null, energyMJ: null, payloadBytes: null, cvPercent: null, p99Ms: null, source: "01-DESIGN.md §4.2; M0+ @133 MHz" },
  { id: "ml-dsa-44", name: "ML-DSA-44", family: "signature", level: 2, timeMs: 158.9, stackKB: 50.6, energyMJ: 12.5, payloadBytes: 2420, cvPercent: 67.5, p99Ms: 489.9, expectedRejectionIterations: 4.25, source: "01-DESIGN.md §4.2; M0+ @133 MHz; iteration estimate from 02-IMPLEMENTATION.md §3.2" },
  { id: "ml-dsa-65", name: "ML-DSA-65", family: "signature", level: 3, timeMs: 256.6, stackKB: 77.6, energyMJ: 20.3, payloadBytes: null, cvPercent: null, p99Ms: null, expectedRejectionIterations: 5.1, source: "01-DESIGN.md §4.2; M0+ @133 MHz; iteration estimate from 02-IMPLEMENTATION.md §3.2" },
  { id: "ml-dsa-87", name: "ML-DSA-87", family: "signature", level: 5, timeMs: 355.2, stackKB: 119.6, energyMJ: 28.1, payloadBytes: 4627, cvPercent: null, p99Ms: 1125, source: "01-DESIGN.md §4.2; M0+ @133 MHz" },
  { id: "slh-dsa-128s", name: "SLH-DSA-128s", family: "signature", level: 1, timeMs: null, stackKB: null, energyMJ: null, payloadBytes: 7856, cvPercent: null, p99Ms: null, source: "01-DESIGN.md §4.2; qualitative/heavy anchor only" },
  { id: "lms-h25", name: "LMS H25", family: "signature", level: 5, timeMs: null, stackKB: null, energyMJ: null, payloadBytes: 1116, cvPercent: null, p99Ms: null, source: "01-DESIGN.md §4.2; qualitative firmware-verification anchor" },
  { id: "ecdh-p256", name: "ECDH P-256", family: "kem", level: 0, timeMs: 606, stackKB: null, energyMJ: 48.9, payloadBytes: 48, cvPercent: null, p99Ms: null, source: "01-DESIGN.md §4.2; approximate 32–64 B encoded size" },
  { id: "ecdsa-p256", name: "ECDSA P-256", family: "signature", level: 0, timeMs: null, stackKB: null, energyMJ: null, payloadBytes: 64, cvPercent: null, p99Ms: null, source: "01-DESIGN.md §4.2; approximate 32–64 B encoded size; source energy is per cycle, not per operation" }
];

export const network = { ieee802154: { mtuBytes: 127, singleHopPayloadBytes: 81, multiHopPayloadBytes: 45, source: "01-DESIGN.md §4.3" }, loraPayloadDefaultBytes: 51, loraPayloadSource: "User-configurable model assumption; no LoRa payload constant in supplied design." };

// The supplied design notes do not report per-algorithm firmware image sizes.
for (const algorithm of algorithms) {
  algorithm.flashFootprintKB = null;
  algorithm.flashFootprintReason = "The source notes did not supply a per-algorithm flash footprint.";
}
