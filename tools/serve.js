import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const host = "127.0.0.1";
const startPort = Number(process.env.PQC_WEB_PORT || 8001);
const maxPort = Math.min(startPort + 20, 65535);
const contentTypes = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf", ".csv": "text/csv; charset=utf-8", ".svg": "image/svg+xml"
};

function serve(request, response) {
  if (!(["GET", "HEAD"].includes(request.method))) {
    response.writeHead(405, { allow: "GET, HEAD" }).end("Method not allowed"); return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname); }
  catch { response.writeHead(400).end("Bad request"); return; }
  const target = resolve(root, `.${pathname}`);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end("Forbidden"); return;
  }
  stat(target).then((info) => {
    const file = info.isDirectory() ? join(target, "index.html") : target;
    return readFile(file).then((body) => {
      response.writeHead(200, { "content-type": contentTypes[extname(file)] || "application/octet-stream", "content-length": body.length, "x-content-type-options": "nosniff" });
      response.end(request.method === "HEAD" ? undefined : body);
    });
  }).catch(() => response.writeHead(404).end("Not found"));
}

function listen(port) {
  const server = createServer(serve);
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && port < maxPort) return listen(port + 1);
    process.stderr.write(`Could not start the web server on ${host}:${port}: ${error.message}\n`);
    process.exitCode = 1;
  });
  server.listen(port, host, () => process.stdout.write(`PQC IoT Simulator available at http://${host}:${port}/\n`));
}

if (!Number.isInteger(startPort) || startPort < 1 || startPort > 65535) {
  process.stderr.write("PQC_WEB_PORT must be a valid TCP port.\n"); process.exitCode = 1;
} else listen(startPort);
