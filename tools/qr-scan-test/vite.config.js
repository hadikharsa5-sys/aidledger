import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

// Dev-only endpoint: the phone POSTs its results here and they are saved
// in ./results, so they can be read on the laptop without emailing CSVs.
function saveResults() {
  const dir = resolve(import.meta.dirname, "results");
  return {
    name: "mr09-save-results",
    configureServer(server) {
      server.middlewares.use("/api/results", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          return res.end();
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
          if (body.length > 5_000_000) req.destroy();
        });
        req.on("end", () => {
          try {
            const { phone, csv } = JSON.parse(body);
            if (typeof csv !== "string" || !csv.startsWith("time,")) throw new Error("bad payload");
            mkdirSync(dir, { recursive: true });
            const safe = String(phone || "phone").replace(/[^\w-]+/g, "-").slice(0, 60);
            const file = `${safe}-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
            writeFileSync(resolve(dir, file), csv);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ saved: file, rows: csv.split("\n").length - 1 }));
          } catch (err) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: String(err.message || err) }));
          }
        });
      });
    },
  };
}

// Phones only allow camera access on HTTPS, so the dev server uses a
// self-signed certificate and listens on the local network.
// `--mode nossl` skips HTTPS: http://localhost already counts as secure,
// which is enough for checking the pages on this computer.
export default defineConfig(({ mode }) => ({
  plugins: [saveResults(), ...(mode === "nossl" ? [] : [basicSsl()])],
  // Plain CSS only; don't pick up the main app's Tailwind PostCSS config
  // from the parent folder.
  css: { postcss: {} },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    rollupOptions: {
      input: {
        scan: resolve(import.meta.dirname, "index.html"),
        cards: resolve(import.meta.dirname, "cards.html"),
      },
    },
  },
}));
