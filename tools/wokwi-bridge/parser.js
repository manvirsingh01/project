const operations = new Set(["keygen", "encapsulate", "decapsulate", "sign", "verify"]);
const events = new Set(["hello", "operation_start", "operation_result", "kat_result", "complete", "error"]);

export function parseTelemetryLine(line, { sessionId, expectedDeviceId } = {}) {
  let event;
  try { event = JSON.parse(String(line).trim()); } catch { return null; }
  if (!event || event.protocolVersion !== 1 || !events.has(event.event) || !Number.isInteger(event.sequence) || event.sequence < 1) return null;
  if (event.source !== "wokwi" || (event.deviceId && event.deviceId !== expectedDeviceId)) return null;
  if (event.event === "hello" && event.deviceId !== expectedDeviceId) return null;
  if (["operation_start", "operation_result"].includes(event.event)) {
    if (!operations.has(event.operation) || typeof event.algorithmId !== "string" || event.timerSource !== "wokwi-virtual") return null;
  }
  if (event.event === "operation_result" && (!Number.isFinite(event.elapsedUs) || event.elapsedUs < 0)) return null;
  if (event.event === "kat_result" && typeof event.passed !== "boolean") return null;
  return { ...event, sessionId, receivedAt: new Date().toISOString() };
}
