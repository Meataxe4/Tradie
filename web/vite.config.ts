import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// `vite build --mode demo` produces a single self-contained HTML file
// (everything inlined) that runs against the in-browser mock API — used for the
// shareable live demo. Normal builds are unaffected.
export default defineConfig(({ mode }) => {
  const demo = mode === "demo";
  return {
    plugins: [react(), ...(demo ? [viteSingleFile()] : [])],
    base: demo ? "./" : "/",
    define: demo ? { "import.meta.env.VITE_DEMO": "true" } : {},
    server: {
      port: 5173,
      proxy: { "/api": "http://localhost:3000" },
    },
    build: {
      outDir: demo ? "dist-demo" : "dist",
    },
  };
});
