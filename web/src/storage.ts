/**
 * Crash-proof storage. In a sandboxed iframe (e.g. a hosted artifact frame),
 * localStorage/sessionStorage can throw on access — which would blank the whole
 * app on load. This wrapper falls back to an in-memory store so the app always
 * runs; persistence is simply best-effort.
 */
const mem = new Map<string, string>();

function safeLocal(): Storage | null {
  try {
    const s = window.localStorage;
    const k = "__probe__";
    s.setItem(k, "1");
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}
const ls = safeLocal();

export const storage = {
  get(key: string): string | null {
    try {
      return ls ? ls.getItem(key) : mem.get(key) ?? null;
    } catch {
      return mem.get(key) ?? null;
    }
  },
  set(key: string, value: string): void {
    mem.set(key, value);
    try {
      ls?.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  remove(key: string): void {
    mem.delete(key);
    try {
      ls?.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
