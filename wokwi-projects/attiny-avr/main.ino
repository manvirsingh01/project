#include <Arduino.h>
#include <SoftwareSerial.h>

// Illustrative workload only. No PQC primitive or library is linked here.
SoftwareSerial uart(PB0, PB1);
const uint8_t phasePins[] = {PB2, PB3, PB4};
const char *phaseNames[] = {"keygen", "sign", "verify"};
const uint16_t workCounts[] = {18000, 24000, 9000};
uint32_t sequenceNumber = 0;

static void emit(const char *event, const char *operation, uint32_t elapsedUs) {
  char line[260];
  snprintf(line, sizeof(line), "{\"protocolVersion\":1,\"sessionId\":\"firmware\",\"sequence\":%lu,\"event\":\"%s\",\"source\":\"wokwi\",\"deviceId\":\"attiny-avr\",\"board\":\"attiny85\",\"clockHz\":8000000,\"firmwareVersion\":\"0.3.0\",\"algorithmId\":\"ml-dsa-44\",\"operation\":\"%s\",\"elapsedUs\":%lu,\"timerSource\":\"wokwi-virtual\",\"implementation\":\"stub\"}", (unsigned long)++sequenceNumber, event, operation, (unsigned long)elapsedUs);
  uart.println(line);
}

static void runStub(const char *name, uint8_t pin, uint16_t count) {
  digitalWrite(pin, HIGH);
  emit("operation_start", name, 0);
  const unsigned long start = micros();
  volatile uint16_t state = 0x9e37;
  for (uint16_t i = 0; i < count; ++i) state = (uint16_t)(state * 251u + 17u) ^ i;
  const uint32_t elapsedUs = micros() - start;
  digitalWrite(pin, LOW);
  emit("operation_result", name, elapsedUs);
}

void setup() {
  uart.begin(9600);
  for (uint8_t pin : phasePins) { pinMode(pin, OUTPUT); digitalWrite(pin, LOW); }
  delay(300);
  emit("hello", "", 0);
}

void loop() {
  for (uint8_t i = 0; i < 3; ++i) runStub(phaseNames[i], phasePins[i], workCounts[i]);
  emit("complete", "", 0);
  delay(1500);
}
