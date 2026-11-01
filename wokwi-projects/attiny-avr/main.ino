#include <Arduino.h>
#include <SoftwareSerial.h>

// Illustrative workload only. No PQC primitive or library is linked here.
SoftwareSerial Serial(PB0, PB1);
const uint8_t phasePins[] = {PB2, PB3, PB4};
const char *phaseNames[] = {"keygen", "sign", "verify"};
const uint16_t workCounts[] = {18000, 24000, 9000};

static void runStub(const char *name, uint8_t pin, uint16_t count) {
  digitalWrite(pin, HIGH);
  const unsigned long start = micros();
  volatile uint16_t state = 0x9e37;
  for (uint16_t i = 0; i < count; ++i) state = (uint16_t)(state * 251u + 17u) ^ i;
  const float elapsedMs = (micros() - start) / 1000.0f;
  digitalWrite(pin, LOW);
  Serial.print(name);
  Serial.print(',');
  Serial.println(elapsedMs, 3);
}

void setup() {
  Serial.begin(115200);
  for (uint8_t pin : phasePins) { pinMode(pin, OUTPUT); digitalWrite(pin, LOW); }
  delay(300);
  Serial.println("# data_source=simulated-illustrative implementation=stub algorithm=ml-dsa-44");
}

void loop() {
  for (uint8_t i = 0; i < 3; ++i) runStub(phaseNames[i], phasePins[i], workCounts[i]);
  delay(1500);
}
