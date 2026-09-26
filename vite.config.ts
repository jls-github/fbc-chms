import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/web",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)) },
  },
  build: { outDir: "../../dist/web", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3000", "/up": "http://localhost:3000" },
  },
});
