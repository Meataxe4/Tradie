/**
 * Demo-only: replace window.fetch so every /api/* request is served by the
 * in-browser mock instead of the network. Lets the real app run with no backend
 * (used for the shareable live-demo build). No actual network request is made,
 * so it works inside sandboxed/CSP environments.
 */
import { handleRequest } from "./mockServer";

function headerValue(headers: HeadersInit | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  if (Array.isArray(headers)) return headers.find(([k]) => k.toLowerCase() === name)?.[1];
  const obj = headers as Record<string, string>;
  for (const k of Object.keys(obj)) if (k.toLowerCase() === name) return obj[k];
  return undefined;
}

export function installMockFetch() {
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes("/api/")) return original(input as RequestInfo, init);

    const method = (init?.method ?? "GET").toUpperCase();
    const auth = headerValue(init?.headers, "authorization");
    let body: unknown;
    if (init?.body) {
      try { body = JSON.parse(init.body as string); } catch { body = undefined; }
    }
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    // Small delay so loading states are visible, like a real network.
    await new Promise((r) => setTimeout(r, 120));
    const res = handleRequest(method, path, body, auth);
    return new Response(JSON.stringify(res.body), {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  };
}
