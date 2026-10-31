import test from "node:test";
import assert from "node:assert/strict";
import { algorithms, DATA_VERSION, devices, network } from "../benchmark-data/index.js";
import { MWC_THRESHOLDS } from "../core/mwcRules.js";

const byId = (items) => Object.fromEntries(items.map((item) => [item.id, item]));
const algo = byId(algorithms);
const board = byId(devices);

test("reference device set and hardware anchors match the supplied design", () => {
  assert.equal(devices.filter((device) => device.isReference === true).length, 5);
  assert.deepEqual(devices.map((device) => device.id).sort(), ["attiny-avr", "cw308-stm32f3", "msp430fr", "nrf51822", "nucleo-l476rg", "nucleo-l4r5zi", "rp2040", "stm32f4-disco", "stm32l031", "stm32l053"].sort());
  assert.deepEqual([board.rp2040.ramKB, board.rp2040.flashKB, board.rp2040.clockMHz], [264, 2048, 133]);
  assert.deepEqual([board["cw308-stm32f3"].ramKB, board["cw308-stm32f3"].flashKB], [40, 256]);
  assert.deepEqual([board["nucleo-l476rg"].ramKB, board["nucleo-l476rg"].flashKB], [128, 1024]);
  assert.equal(board["nucleo-l476rg"].clockMHz, null);
  assert.deepEqual([board["stm32f4-disco"].ramKB, board["stm32f4-disco"].flashKB, board["stm32f4-disco"].clockMHz], [192, 1024, 168]);
  assert.deepEqual([board["nucleo-l4r5zi"].ramKB, board["nucleo-l4r5zi"].flashKB], [640, 2048]);
  assert.equal(board["nucleo-l4r5zi"].clockMHz, null);
  assert.equal(board["stm32l031"].ramKB, 8);
  assert.equal(board["attiny-avr"].cpu, "avr-8bit");
  assert.equal(board["msp430fr"].cpu, "msp430-16bit");
});

test("every algorithm has provenance and all published anchor values stay intact", () => {
  assert.ok(algorithms.every((item) => typeof item.source === "string" && item.source.trim().length > 0));
  assert.ok(algorithms.every((item) => item.flashFootprintKB === null));
  assert.deepEqual([algo["ml-kem-512"].timeMs, algo["ml-kem-512"].stackKB, algo["ml-kem-512"].energyMJ], [35.7, 9.4, 2.83]);
  assert.deepEqual([algo["ml-kem-768"].timeMs, algo["ml-kem-768"].stackKB, algo["ml-kem-768"].energyMJ], [56.6, 14.2, 4.48]);
  assert.equal(algo["ml-kem-1024"].timeMs, 85.7);
  assert.deepEqual([algo["ecdh-p256"].timeMs, algo["ecdh-p256"].energyMJ], [606, 48.9]);
  assert.deepEqual([algo["ml-dsa-44"].timeMs, algo["ml-dsa-44"].cvPercent, algo["ml-dsa-44"].p99Ms, algo["ml-dsa-44"].stackKB], [158.9, 67.5, 489.9, 50.6]);
  assert.deepEqual([algo["ml-dsa-65"].timeMs, algo["ml-dsa-65"].stackKB], [256.6, 77.6]);
  assert.deepEqual([algo["ml-dsa-87"].timeMs, algo["ml-dsa-87"].p99Ms, algo["ml-dsa-87"].stackKB], [355.2, 1125, 119.6]);
  assert.equal(algo["slh-dsa-128s"].payloadBytes, 7856);
  assert.equal(algo["lms-h25"].payloadBytes, 1116);
  assert.equal(algo["ml-dsa-44"].payloadBytes, 2420);
  assert.deepEqual([network.ieee802154.mtuBytes, network.ieee802154.singleHopPayloadBytes, network.ieee802154.multiHopPayloadBytes], [127, 81, 45]);
});

test("MWC threshold data matches the stated floors", () => {
  assert.equal(DATA_VERSION, "1.2.0");
  assert.deepEqual(MWC_THRESHOLDS, { minimumClockMHz: 48, kemRamKB: 64, fullAgilityRamKB: 128, minimumFlashKB: 512, recommendedFlashKB: 1024, infeasibleRamRatio: 0.8 });
});
