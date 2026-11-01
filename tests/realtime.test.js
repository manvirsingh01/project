import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTelemetryLine } from "../tools/wokwi-bridge/parser.js";
import { WokwiSessionManager } from "../tools/wokwi-bridge/sessionManager.js";

const telemetry = (overrides = {}) => JSON.stringify({ protocolVersion: 1, sessionId: "firmware", sequence: 2, event: "operation_result", source: "wokwi", deviceId: "rp2040", algorithmId: "ml-kem-512", operation: "encapsulate", elapsedUs: 1234, timerSource: "wokwi-virtual", implementation: "stub", ...overrides });

test("JSONL telemetry validates event types, board identity, sequences and nonnegative timings", () => {
  const parsed = parseTelemetryLine(telemetry(), { sessionId: "session-a", expectedDeviceId: "rp2040" });
  assert.equal(parsed.sessionId, "session-a");
  assert.equal(parsed.elapsedUs, 1234);
  assert.equal(parseTelemetryLine("not json"), null);
  assert.equal(parseTelemetryLine(telemetry({ sequence: 0 })), null);
  assert.equal(parseTelemetryLine(telemetry({ elapsedUs: -1 })), null);
  assert.equal(parseTelemetryLine(telemetry({ deviceId: "attiny-avr", event: "hello" }), { expectedDeviceId: "rp2040" }), null);
  assert.equal(parseTelemetryLine(telemetry({ event: "unknown" })), null);
});

test("session manager runs only fixed projects and forwards structured events", async (t) => {
  const artifactDirectory = await mkdtemp(join(tmpdir(), "pqc-realtime-"));
  t.after(() => rm(artifactDirectory, { recursive: true, force: true }));
  let spawned, fakeChild;
  const fakeSpawn = (command, args, options) => {
    spawned = { command, args, options };
    fakeChild = new EventEmitter(); fakeChild.stdout = new PassThrough(); fakeChild.stderr = new PassThrough();
    fakeChild.kill = () => { fakeChild.emit("close", null, "SIGTERM"); return true; };
    return fakeChild;
  };
  const manager = new WokwiSessionManager({ spawnProcess: fakeSpawn, artifactDirectory });
  await assert.rejects(manager.start("../outside"), /Unsupported Wokwi project/);
  await assert.rejects(manager.start("rp2040", 500), /between 1000 and 120000/);
  const session = await manager.start("rp2040", 30000);
  assert.equal(spawned.command, "wokwi-cli");
  assert.equal(spawned.options.shell, false);
  assert.ok(spawned.args[0].endsWith("/wokwi-projects/rp2040"));
  assert.equal(spawned.args.includes("../outside"), false);
  const received = [];
  manager.on(`session:${session.id}`, (event) => received.push(event));
  fakeChild.stdout.write(`${telemetry()}\n`);
  fakeChild.stdout.write(`${telemetry({ sequence: 2 })}\n`);
  assert.equal(received.filter((event) => event.type === "telemetry").length, 1);
  assert.equal(received.find((event) => event.type === "telemetry").event.sessionId, session.id);
  assert.ok(received.some((event) => event.type === "rejected_event"));
  assert.match(manager.snapshot(session.id).rawLog, /operation_result/);
  fakeChild.emit("close", 0, null);
  assert.equal(manager.snapshot(session.id).status, "completed");
});

