import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import { parseTelemetryLine } from "./parser.js";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const artifacts = join(root, "artifacts", "wokwi");
const projects = Object.freeze({
  rp2040: { path: join(root, "wokwi-projects", "rp2040"), deviceId: "rp2040", algorithmId: "ml-kem-512" },
  "attiny-avr": { path: join(root, "wokwi-projects", "attiny-avr"), deviceId: "attiny-avr", algorithmId: "ml-dsa-44" }
});

export class WokwiSessionManager extends EventEmitter {
  #sessions = new Map();
  constructor({ spawnProcess = spawn, now = () => new Date().toISOString(), artifactDirectory = artifacts } = {}) {
    super(); this.spawnProcess = spawnProcess; this.now = now; this.artifactDirectory = artifactDirectory;
  }

  async start(projectId, timeoutMs = 30000) {
    const project = projects[projectId];
    if (!project) throw new Error("Unsupported Wokwi project. Choose rp2040 or attiny-avr.");
    const timeout = Number(timeoutMs);
    if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 120000) throw new Error("timeoutMs must be between 1000 and 120000.");
    if ([...this.#sessions.values()].filter((item) => item.status === "running" || item.status === "starting").length >= 3) throw new Error("The local bridge allows at most three active sessions.");
    if (this.#sessions.size >= 20) {
      const expired = [...this.#sessions.values()].find((item) => item.endedAt);
      if (expired) this.#sessions.delete(expired.id);
    }
    await mkdir(this.artifactDirectory, { recursive: true });
    const id = randomUUID(), logPath = join(this.artifactDirectory, `${id}.jsonl`);
    const session = { id, projectId, deviceId: project.deviceId, algorithmId: project.algorithmId, status: "starting", createdAt: this.now(), endedAt: null, exitCode: null, error: null, events: [], eventCounter: 0, rawLog: "", rawLogBytes: 0, process: null, logPath, lastSequence: 0, wallTimer: null };
    this.#sessions.set(id, session);
    let child;
    try {
      child = this.spawnProcess("wokwi-cli", [project.path, "--timeout", String(timeout), "--serial-log-file", logPath], {
        cwd: project.path, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: process.env
      });
      session.process = child; session.status = "running"; this.#publish(session, { type: "status", status: session.status });
      session.wallTimer = setTimeout(() => { session.error = "Bridge wall-clock timeout reached."; child.kill("SIGTERM"); }, 120000);
      session.wallTimer.unref?.();
      this.#readStream(session, child.stdout); this.#readStream(session, child.stderr, true);
      child.once("error", (error) => this.#finish(session, null, error.message));
      child.once("close", (code, signal) => this.#finish(session, code, signal ? `Wokwi process stopped (${signal}).` : null));
    } catch (error) { this.#finish(session, null, error.message); }
    return this.snapshot(id);
  }

  #readStream(session, stream, stderr = false) {
    let pending = "";
    stream?.setEncoding("utf8");
    stream?.on("data", (chunk) => {
      pending += chunk;
      const lines = pending.split(/\r?\n/); pending = lines.pop();
      for (const line of lines) this.#line(session, line, stderr);
      if (pending.length > 8192) { this.#line(session, `${pending.slice(0, 8192)} [line truncated]`, stderr); pending = ""; }
    });
    stream?.on("end", () => { if (pending) this.#line(session, pending, stderr); });
  }

  #line(session, line, stderr) {
    if (!line) return;
    session.rawLog += `${line}\n`;
    if (session.rawLog.length > 1024 * 1024) session.rawLog = session.rawLog.slice(-1024 * 1024);
    const loggedLine = `${line}\n`;
    if (session.rawLogBytes < 1024 * 1024) {
      const clipped = loggedLine.slice(0, 1024 * 1024 - session.rawLogBytes);
      session.rawLogBytes += clipped.length;
      appendFile(session.logPath, clipped).catch(() => {});
    }
    if (stderr) { this.#publish(session, { type: "log", stream: "stderr", line }); return; }
    const parsed = parseTelemetryLine(line, { sessionId: session.id, expectedDeviceId: session.deviceId });
    if (!parsed) { this.#publish(session, { type: "log", stream: "serial", line }); return; }
    if (parsed.sequence <= session.lastSequence) { this.#publish(session, { type: "rejected_event", reason: "Telemetry sequence number did not increase." }); return; }
    session.lastSequence = parsed.sequence;
    if (parsed.algorithmId && parsed.algorithmId !== session.algorithmId) {
      this.#publish(session, { type: "rejected_event", reason: "Algorithm does not match the allow-listed project workload." }); return;
    }
    parsed.implementation = "stub";
    parsed.data_source = "simulated-illustrative";
    this.#publish(session, { type: "telemetry", event: parsed });
  }

  #finish(session, code, error) {
    if (session.endedAt) return;
    clearTimeout(session.wallTimer);
    session.endedAt = this.now(); session.exitCode = code;
    session.error = session.error || error;
    session.status = session.error || (code !== 0 && code !== null) ? "failed" : "completed";
    this.#publish(session, { type: "status", status: session.status, exitCode: code, error: error || null });
  }

  #publish(session, item) {
    const event = { id: ++session.eventCounter, at: this.now(), ...item };
    session.events.push(event);
    if (session.events.length > 500) session.events.shift();
    this.emit(`session:${session.id}`, event);
  }

  stop(id) {
    const session = this.#sessions.get(id);
    if (!session) throw new Error("Wokwi session not found.");
    if (session.process && !session.endedAt) session.process.kill("SIGTERM");
    return this.snapshot(id);
  }

  snapshot(id) {
    const session = this.#sessions.get(id);
    if (!session) return null;
    const { process, rawLog, rawLogBytes, logPath, lastSequence, eventCounter, wallTimer, ...metadata } = session;
    return { ...metadata, rawLog };
  }
  ids() { return [...this.#sessions.keys()]; }
}
