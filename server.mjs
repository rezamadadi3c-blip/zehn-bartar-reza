import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import worker from "./src/worker.js";

const ROOT = resolve(fileURLToPath(new URL("./public/", import.meta.url)));
const PORT = Number(process.env.PORT || 3000);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

const env = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  BRAVE_SEARCH_API_KEY: process.env.BRAVE_SEARCH_API_KEY || "",
  TAVILY_API_KEY: process.env.TAVILY_API_KEY || ""
};

async function readBody(req, limit = 8 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function serveStatic(req, res, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { res.writeHead(400).end("Bad Request"); return; }

  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const filePath = resolve(ROOT, relative);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("Not a file");
    const data = await readFile(filePath);
    const headers = {
      "content-type": MIME[extname(filePath).toLowerCase()] || "application/octet-stream",
      "content-length": String(data.length),
      "x-content-type-options": "nosniff"
    };
    if (relative === "sw.js" || relative === "index.html") headers["cache-control"] = "no-cache";
    else headers["cache-control"] = "public, max-age=3600";
    res.writeHead(200, headers);
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not Found");
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (!url.pathname.startsWith("/api/")) {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { allow: "GET, HEAD" }).end("Method Not Allowed");
        return;
      }
      await serveStatic(req, res, url.pathname);
      return;
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined || ["host", "connection", "content-length", "transfer-encoding"].includes(key.toLowerCase())) continue;
      headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) headers.set("CF-Connecting-IP", forwarded);

    const init = { method: req.method, headers };
    if (req.method !== "GET" && req.method !== "HEAD") {
      const body = await readBody(req);
      if (body.length) {
        init.body = body;
        init.duplex = "half";
        if (req.headers["content-length"]) headers.set("content-length", String(body.length));
      }
    }

    const request = new Request(new URL(req.url || "/", `http://${req.headers.host || "localhost"}`), init);
    const response = await worker.fetch(request, env);
    const responseHeaders = Object.fromEntries(response.headers.entries());
    res.writeHead(response.status, responseHeaders);
    if (req.method === "HEAD" || !response.body) {
      res.end();
      return;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    res.end(bytes);
  } catch (error) {
    const status = error?.message === "Request body too large" ? 413 : 500;
    if (!res.headersSent) {
      res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: status === 413 ? "حجم درخواست بیش از حد مجاز است." : "خطای داخلی سرور." }));
    } else res.end();
    console.error("Server error:", error?.message || error);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Zehn Bartar listening on port ${PORT}`);
});
