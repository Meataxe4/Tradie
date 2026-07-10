import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { SessionProvider } from "./session";
import { App } from "./App";
import "./styles.css";
import { storage } from "./storage";

// Light is the default; apply the persisted theme before first paint (no flash).
document.documentElement.setAttribute(
  "data-theme",
  storage.get("squiz.theme") === "dark" ? "dark" : "light",
);

function render() {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <HashRouter>
        <SessionProvider>
          <App />
        </SessionProvider>
      </HashRouter>
    </React.StrictMode>,
  );
}

// Live-demo build (VITE_DEMO=1): serve /api from an in-browser mock, no backend.
if (import.meta.env.VITE_DEMO) {
  import("./demo/installMockFetch").then((m) => { m.installMockFetch(); render(); });
} else {
  render();
}
