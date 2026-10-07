/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import store from "./store-config.json";

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

// The starter recipes' photos (starter-photos/, kept out of git) are served at /starter/ and copied into
// the build only while store-config.json "starterPhotos" is true: closed testing, never production.
function starterPhotos(): Plugin {
  const dir = "starter-photos";
  const on = (store as { starterPhotos?: boolean }).starterPhotos === true && existsSync(dir);
  let outDir = "dist";
  return {
    name: "starter-photos",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    configureServer(server) {
      if (!on) return;
      server.middlewares.use("/starter", (req, res, next) => {
        const file = join(dir, decodeURIComponent((req.url ?? "").split("?")[0]).replace(/[\\/]/g, "")); // a bare file name: no ../
        if (!file.endsWith(".jpg") || !existsSync(file)) return next();
        res.setHeader("Content-Type", "image/jpeg");
        res.end(readFileSync(file));
      });
    },
    writeBundle() {
      if (!on) return;
      mkdirSync(join(outDir, "starter"), { recursive: true });
      for (const f of readdirSync(dir).filter((x) => x.endsWith(".jpg"))) copyFileSync(join(dir, f), join(outDir, "starter", f));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devFetch(), starterPhotos()],
  server: { host: true },
  test: { include: ["src/**/*.test.ts"] },
});
