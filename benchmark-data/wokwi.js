// Only mappings backed by Wokwi's documented board list are marked available.
export const wokwiBoards = {
  rp2040: { board: "wokwi-pi-pico", label: "Raspberry Pi Pico (RP2040)", project: "rp2040", algorithmId: "ml-kem-512", exactness: "same board family" },
  "attiny-avr": { board: "wokwi-attiny85", label: "ATtiny85", project: "attiny-avr", algorithmId: "ml-dsa-44", exactness: "representative part for the AVR device class" },
  stm32l031: { board: "board-st-nucleo-l031k6", label: "NUCLEO-L031K6", project: null, exactness: "same MCU family; different board" }
};
