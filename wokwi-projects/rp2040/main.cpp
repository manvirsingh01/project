#include <Arduino.h>

// Illustrative workload only. No PQC primitive or library is linked here.
const int phasePins[] = {2, 3, 4};
const char *phaseNames[] = {"keygen", "encapsulate", "decapsulate"};
const uint32_t workCounts[] = {60000, 45000, 45000};
uint32_t sequenceNumber = 0;

static void emit(const char *event, const char *operation, uint32_t elapsedUs) {
  char line[300];
  snprintf(line, sizeof(line), "{\"protocolVersion\":1,\"sessionId\":\"firmware\",\"sequence\":%lu,\"event\":\"%s\",\"source\":\"wokwi\",\"deviceId\":\"rp2040\",\"board\":\"raspberry-pi-pico\",\"clockHz\":125000000,\"firmwareVersion\":\"0.3.0\",\"algorithmId\":\"ml-kem-512\",\"operation\":\"%s\",\"elapsedUs\":%lu,\"timerSource\":\"wokwi-virtual\",\"implementation\":\"stub\"}", (unsigned long)++sequenceNumber, event, operation, (unsigned long)elapsedUs);
  Serial.println(line);
}

static void runStub(const char *name, int pin, uint32_t count) {
  digitalWrite(pin, HIGH);
  emit("operation_start", name, 0);
  const uint32_t start = micros();
  volatile uint32_t state = 0x9e3779b9;
  for (uint32_t i = 0; i < count; ++i) state = (state * 1664525u + 1013904223u) ^ i;
  const uint32_t elapsedUs = micros() - start;
  digitalWrite(pin, LOW);
  emit("operation_result", name, elapsedUs);
}

void setup() {
  Serial.begin(115200);
  for (int pin : phasePins) { pinMode(pin, OUTPUT); digitalWrite(pin, LOW); }
  delay(300);
  emit("hello", "", 0);
}

void loop() {
  for (int i = 0; i < 3; ++i) runStub(phaseNames[i], phasePins[i], workCounts[i]);
  char line[150];
  snprintf(line, sizeof(line), "{\"protocolVersion\":1,\"sessionId\":\"firmware\",\"sequence\":%lu,\"event\":\"complete\",\"source\":\"wokwi\",\"deviceId\":\"rp2040\"}", (unsigned long)++sequenceNumber);
  Serial.println(line);
  delay(1500);
}
