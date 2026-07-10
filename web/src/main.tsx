import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, MemoryRouter } from "react-router-dom";
import { SessionProvider } from "./session";
import { App } from "./App";
import "./styles.css";
import { storage } from "./storage";

// Light is the default; apply the persisted theme before first paint (no flash).
try {
  document.documentElement.setAttribute("data-theme", storage.get("squiz.theme") === "dark" ? "dark" : "light");
} catch { /* ignore */ }

// The live-demo build runs in a sandboxed frame where history.pushState throws;
// MemoryRouter keeps routing in memory and never touches window.history/location.
const Router = import.meta.env.VITE_DEMO ? MemoryRouter : HashRouter;

function showFatal(message: string) {
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML =
      '<div style="max-width:520px;margin:12vh auto;padding:24px;font-family:system-ui;color:#2a2f36">' +
      '<h2 style="margin:0 0 8px">Something went wrong loading the demo</h2>' +
      '<p style="color:#82817a;font-size:14px">' + message + "</p></div>";
  }
}
window.addEventListener("error", (e) => showFatal(String(e.message)));
window.addEventListener("unhandledrejection", (e) => showFatal(String((e as PromiseRejectionEvent).reason)));

function render() {
  try {
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <Router>
          <SessionProvider>
            <App />
          </SessionProvider>
        </Router>
      </React.StrictMode>,
    );
  } catch (e) {
    showFatal(e instanceof Error ? e.message : String(e));
  }
}

// Live-demo build (VITE_DEMO=1): serve /api from an in-browser mock, no backend.
if (import.meta.env.VITE_DEMO) {
  import("./demo/installMockFetch").then((m) => { m.installMockFetch(); render(); });
} else {
  render();
}
