import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".wasm": "application/wasm" };
const port = Number(process.env.PORT || 4173);
createServer(async (req, res) => {
  let path;
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    path = resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
  } catch {
    res.writeHead(400).end("Invalid request");
    return;
  }
  if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const body = await readFile(path);
    res.writeHead(200, { "Content-Type": (types[extname(path)] || "application/octet-stream") + "; charset=utf-8", "X-Content-Type-Options": "nosniff" });
    res.end(body);
  } catch (error) {
    const missing = ["ENOENT", "EISDIR", "ENOTDIR"].includes(error.code);
    if (!missing) console.error("Unable to serve file:", error);
    res.writeHead(missing ? 404 : 500).end(missing ? "Not found" : "Unable to read file");
  }
}).listen(port, "127.0.0.1", () => console.log(`Daylight ready at http://localhost:${port}`));
