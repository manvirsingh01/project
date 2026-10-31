import test from "node:test";
import assert from "node:assert/strict";
import { networkAlerts, regressionAlert, simulationAlerts } from "../core/alerts.js";
import { simulate } from "../core/index.js";

test("simulation alerts identify infeasible configurations and high p99 tails", () => {
  const impossible = simulationAlerts(simulate("cw308-stm32f3", "ml-dsa-87"));
  assert.ok(impossible.some((alert) => alert.rule === "infeasible" && alert.severity === "critical"));
  const tail = simulationAlerts(simulate("rp2040", "ml-dsa-87"));
  assert.ok(tail.some((alert) => alert.rule === "tail-latency" && alert.severity === "warning"));
});

test("network reliability warning uses a strict 0.8 boundary and fragmentation is informational", () => {
  assert.equal(networkAlerts({ successProbability: 0.8, fragmentCount: 20 }).some((alert) => alert.rule === "low-reliability"), false);
  const alerts = networkAlerts({ successProbability: 0.79, fragmentCount: 21 });
  assert.ok(alerts.some((alert) => alert.rule === "low-reliability" && alert.severity === "warning"));
  assert.ok(alerts.some((alert) => alert.rule === "fragmentation" && alert.severity === "info"));
});

test("regression alert fires only when the configured percentage is exceeded", () => {
  const before = { estimatedTimeMs: 100 };
  assert.equal(regressionAlert(before, { estimatedTimeMs: 105 }, 5), null);
  assert.equal(regressionAlert(before, { estimatedTimeMs: 106 }, 5).rule, "regression");
});
