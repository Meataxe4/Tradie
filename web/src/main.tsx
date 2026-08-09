import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, MemoryRouter } from "react-router-dom";
import { SessionProvider } from "./session";
import { App } from "./App";
import "./styles.css";
import { storage } from "./storage";
import { installMockFetch } from "./demo/installMockFetch";

// Light is the default; apply the persisted theme before first paint (no flash).
try {
  document.documentElement.setAttribute("data-theme", storage.get("squiz.theme") === "dark" ? "dark" : "light");
} catch { /* ignore */ }

// Routing has to survive two very different homes: a normal https page (where
// the URL should track the route so links like #/tradies can be shared), and a
// sandboxed frame or file:// page where history.pushState throws SecurityError.
// HashRouter uses pushState underneath, so it cannot be used in the second case.
//
// Probe once, then pick. Either way the route named by the initial hash is
// honoured: MemoryRouter never reads window.location, so when we fall back to it
// the starting route has to be handed over explicitly. Without that seeding a
// shared deep link silently lands the visitor on the home page instead.
function historyIsWritable(): boolean {
  try {
    window.history.replaceState(window.history.state, "", window.location.href);
    return true;
  } catch {
    return false;
  }
}

/** "#/tradies" -> "/tradies"; absent or bare hash -> "/". */
function routeFromHash(): string {
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw || raw === "/") return "/";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

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
        {historyIsWritable() ? (
          <HashRouter>
            <SessionProvider>
              <App />
            </SessionProvider>
          </HashRouter>
        ) : (
          <MemoryRouter initialEntries={[routeFromHash()]}>
            <SessionProvider>
              <App />
            </SessionProvider>
          </MemoryRouter>
        )}
      </React.StrictMode>,
    );
  } catch (e) {
    showFatal(e instanceof Error ? e.message : String(e));
  }
}

// Live-demo build: serve /api from an in-browser mock, no backend. Statically
// imported (no dynamic import()) so the whole app is one inline script — which
// also works when the file is opened directly via file://. In production the
// flag is defined false, so this branch and the mock are tree-shaken away.
if (import.meta.env.VITE_DEMO) installMockFetch();
render();
