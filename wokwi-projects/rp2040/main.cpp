#include <Arduino.h>

// Illustrative workload only. No PQC primitive or library is linked here.
const int phasePins[] = {2, 3, 4};
const char *phaseNames[] = {"keygen", "encapsulate", "decapsulate"};
const uint32_t workCounts[] = {60000, 45000, 45000};

static void runStub(const char *name, int pin, uint32_t count) {
  digitalWrite(pin, HIGH);
  const uint32_t start = micros();
  volatile uint32_t state = 0x9e3779b9;
  for (uint32_t i = 0; i < count; ++i) state = (state * 1664525u + 1013904223u) ^ i;
  const float elapsedMs = (micros() - start) / 1000.0f;
  digitalWrite(pin, LOW);
  Serial.print(name);
  Serial.print(',');
  Serial.println(elapsedMs, 3);
}

void setup() {
  Serial.begin(115200);
  for (int pin : phasePins) { pinMode(pin, OUTPUT); digitalWrite(pin, LOW); }
  delay(300);
  Serial.println("# data_source=simulated-illustrative implementation=stub algorithm=ml-kem-512");
}

void loop() {
  for (int i = 0; i < 3; ++i) runStub(phaseNames[i], phasePins[i], workCounts[i]);
  delay(1500);
}
