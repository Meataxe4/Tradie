import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// `vite build --mode demo` produces a single self-contained HTML file
// (everything inlined) that runs against the in-browser mock API — used for the
// shareable live demo. Normal builds are unaffected.
export default defineConfig(({ mode }) => {
  // "demo" = variant A (classic sign-up-first landing); "demo-b" = variant B
  // (problem-first intake, sign-up only to unlock the quote). Same code, two
  // single-file builds so the variants can be tested at separate URLs.
  const demo = mode === "demo" || mode === "demo-b";
  const variantB = mode === "demo-b";
  return {
    plugins: [react(), ...(demo ? [viteSingleFile()] : [])],
    base: demo ? "./" : "/",
    // Statically define the flag both ways so the mock is tree-shaken out of
    // production and inlined (no dynamic import) into the single-file demo.
    define: {
      "import.meta.env.VITE_DEMO": demo ? "true" : "false",
      "import.meta.env.VITE_VARIANT": JSON.stringify(variantB ? "b" : "a"),
    },
    server: {
      port: 5173,
      proxy: { "/api": "http://localhost:3000" },
    },
    build: {
      outDir: variantB ? "dist-demo-b" : demo ? "dist-demo" : "dist",
    },
  };
});
