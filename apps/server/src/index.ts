import fs from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { PORT, WEB_DIST } from "./config";
import { createDb } from "./db/client";

const { db, sqlite } = createDb();
const app = createApp(db);

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon"
};

if (fs.existsSync(WEB_DIST)) {
  app.get("*", (c) => {
    const requestPath = decodeURIComponent(c.req.path);

    if (requestPath.startsWith("/api/")) {
      return c.json({ error: { message: "Not found" } }, 404);
    }

    const candidate = path.resolve(WEB_DIST, `.${requestPath}`);
    if (
      candidate.startsWith(WEB_DIST) &&
      fs.existsSync(candidate) &&
      fs.statSync(candidate).isFile()
    ) {
      return c.body(fs.readFileSync(candidate), 200, {
        "Content-Type": mimeTypes[path.extname(candidate)] ?? "application/octet-stream"
      });
    }

    return c.html(fs.readFileSync(path.join(WEB_DIST, "index.html"), "utf8"));
  });
}

const server = serve(
  { fetch: app.fetch, port: PORT, hostname: "127.0.0.1" },
  (info) => {
    console.log(`Eisenhower Matrix running at http://127.0.0.1:${info.port}`);
  }
);

function shutdown(): void {
  server.close();
  sqlite.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
