import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { WokwiSessionManager } from "./sessionManager.js";

const host = "127.0.0.1", port = Number(process.env.PQC_WOKWI_PORT || 8787);
const sessions = new WokwiSessionManager();

function reply(response, status, body, type = "application/json; charset=utf-8") {
  response.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  response.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}
function cors(request, response) {
  const origin = request.headers.origin;
  if (origin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return false;
  if (origin) response.setHeader("access-control-allow-origin", origin);
  response.setHeader("vary", "Origin");
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type, last-event-id");
  return true;
}
async function readBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 4096) throw new Error("Request body is too large.");
  }
  return body ? JSON.parse(body) : {};
}

export function createWokwiBridgeServer() {
  return createServer(async (request, response) => {
    if (!cors(request, response)) return reply(response, 403, { error: "Origin is not allowed." });
    if (request.method === "OPTIONS") { response.writeHead(204); return response.end(); }
    const url = new URL(request.url, `http://${host}:${port}`);
    if (request.method === "GET" && url.pathname === "/") {
      const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>PQC Wokwi Bridge</title><body style="font:16px system-ui;max-width:680px;margin:10vh auto;padding:0 20px;color:#203148"><h1>PQC Wokwi bridge is running</h1><p>This local service runs the allow-listed Wokwi projects and streams their serial events. It is separate from the simulator web app.</p><p>In another terminal, run <code>npm run start</code> and open the URL printed there. In Hardware Sim, start a local run.</p><p>Bridge health: <a href="/api/health">/api/health</a></p><p>Results from the current sketches are illustrative dummy-workload timings, not PQC or physical measurements.</p></body></html>`;
      return reply(response, 200, page, "text/html; charset=utf-8");
    }
    if (request.method === "GET" && url.pathname === "/api/health") return reply(response, 200, { ok: true, runner: "wokwi-cli", boundTo: host });
    if (request.method === "POST" && url.pathname === "/api/wokwi/sessions") {
      try { const body = await readBody(request); return reply(response, 202, await sessions.start(body.projectId, body.timeoutMs)); }
      catch (error) { return reply(response, 400, { error: error.message }); }
    }
    const match = url.pathname.match(/^\/api\/wokwi\/sessions\/([0-9a-f-]{36})(?:\/(events|stop|log))?$/i);
    if (!match) return reply(response, 404, { error: "Route not found." });
    const [, id, action] = match, session = sessions.snapshot(id);
    if (!session) return reply(response, 404, { error: "Wokwi session not found." });
    if (request.method === "GET" && !action) return reply(response, 200, session);
    if (request.method === "GET" && action === "log") return reply(response, 200, session.rawLog, "text/plain; charset=utf-8");
    if (request.method === "POST" && action === "stop") {
      try { return reply(response, 200, sessions.stop(id)); } catch (error) { return reply(response, 404, { error: error.message }); }
    }
    if (request.method === "GET" && action === "events") {
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      response.write(": connected\n\n");
      const after = Number(request.headers["last-event-id"] || url.searchParams.get("after") || 0);
      const send = (event) => response.write(`id: ${event.id}\nevent: update\ndata: ${JSON.stringify(event)}\n\n`);
      for (const event of session.events) if (event.id > after) send(event);
      const listener = (event) => send(event);
      sessions.on(`session:${id}`, listener);
      const keepAlive = setInterval(() => response.write(": keepalive\n\n"), 15000);
      request.on("close", () => { clearInterval(keepAlive); sessions.off(`session:${id}`, listener); });
      return;
    }
    return reply(response, 405, { error: "Method not allowed." });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = createWokwiBridgeServer();
  server.listen(port, host, () => process.stdout.write(`Wokwi bridge listening at http://${host}:${port}\n`));
}
