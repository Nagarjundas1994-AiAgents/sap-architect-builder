import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Proxy /api → SAP CAP (CAPM) on :4004 — not Express.
 * CAP server.js exposes a REST facade backed by ArchitectService.
 *
 * The facade authenticates every request, so the dev proxy signs in as one of the
 * mocked users from apps/cap/package.json. This is a **development convenience
 * only** — it exists in the Vite dev server, never in the built bundle.
 *
 * In production the studio is served behind an approuter and the browser carries a
 * real XSUAA/IAS token; nothing here participates in that path. Override the local
 * identity with DEV_USER / DEV_PASS to exercise the Viewer role (which is denied the
 * pipeline actions, as it should be).
 */
const devUser = process.env.DEV_USER ?? "architect";
const devPass = process.env.DEV_PASS ?? "architect";
const devAuth = `Basic ${Buffer.from(`${devUser}:${devPass}`).toString("base64")}`;

const backend = {
  target: "http://localhost:4004",
  changeOrigin: true,
  headers: { Authorization: devAuth },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": backend,
      "/odata": backend,
    },
  },
});
