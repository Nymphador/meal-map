/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// Development in a desktop browser only: the phone fetches recipe pages with native HTTP, but a browser
// page can't read other sites, so the dev server fetches them for it (src/data/net.ts).
function devFetch(): Plugin {
  return {
    name: "dev-fetch",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__fetch", async (req, res) => {
        const url = new URL(req.url ?? "", "http://x").searchParams.get("url") ?? "";
        if (!/^https?:\/\//.test(url)) {
          res.statusCode = 400;
          res.end("bad url");
          return;
        }
        try {
          const r = await fetch(url, { headers: { Accept: "text/html,application/xhtml+xml,image/*", "User-Agent": String(req.headers["user-agent"] ?? "") } });
          res.statusCode = r.status;
          res.setHeader("Content-Type", r.headers.get("content-type") ?? "application/octet-stream");
          res.end(Buffer.from(await r.arrayBuffer()));
        } catch {
          res.statusCode = 502;
          res.end("fetch failed");
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devFetch()],
  server: { host: true },
  test: { include: ["src/**/*.test.ts"] },
});
