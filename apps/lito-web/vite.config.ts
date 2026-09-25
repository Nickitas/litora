import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  server: { proxy: { "/api": { target: process.env.API_PROXY_TARGET ?? "http://localhost:3000", changeOrigin: true } } },
  plugins: [react(), tailwindcss()],
  resolve: {
    // В workspace React должен резолвиться одной копией, иначе hooks получают
    // разные React-контексты и падают с "Cannot read properties of null".
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
