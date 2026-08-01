import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Proxy /api → SAP CAP (CAPM) on :4004 — not Express.
 * CAP server.js exposes a REST facade backed by ArchitectService.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4004",
        changeOrigin: true,
      },
      "/odata": {
        target: "http://localhost:4004",
        changeOrigin: true,
      },
    },
  },
});
