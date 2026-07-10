import { useState } from "react";
import { api } from "../api";
import { Icon } from "../ui";

const DIMENSIONS: Record<"homeowner" | "tradie", Array<[string, string]>> = {
  // The customer rates the trade.
  homeowner: [
    ["quality", "Quality of work"],
    ["timeliness", "On time"],
    ["communication", "Communication"],
    ["tidiness", "Tidiness"],
    ["value", "Value for money"],
  ],
  // The trade rates the customer.
  tradie: [
    ["clear_scope", "Clear scope"],
    ["communication", "Communication"],
    ["access", "Site access"],
    ["prompt_payment", "Prompt payment"],
  ],
};

function StarInput({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="star-input">
      <span className="si-label">{label}</span>
      <span className="si-stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className={n <= value ? "on" : ""}
            onClick={() => onChange(n)}
          >
            {Icon.starFill}
          </button>
        ))}
      </span>
    </div>
  );
}

/** §4 structured review — dimensions depend on who's rating whom. */
export function ReviewForm({ bookingId, raterRole, onDone }: {
  bookingId: string;
  raterRole: "homeowner" | "tradie";
  onDone: () => void;
}) {
  const dims = DIMENSIONS[raterRole];
  const [scores, setScores] = useState<Record<string, number>>(() => Object.fromEntries(dims.map(([k]) => [k, 5])));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const set = (k: string, n: number) => setScores((s) => ({ ...s, [k]: n }));
  const overall = Math.round((Object.values(scores).reduce((a, b) => a + b, 0) / dims.length) * 10) / 10;

  const submit = async () => {
    setBusy(true); setErr("");
    try { await api.review(bookingId, Math.round(overall), scores, text.trim()); onDone(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop: 14, borderTop: "1px solid var(--hairline)", paddingTop: 14 }}>
      <p className="eyebrow" style={{ marginBottom: 10 }}>
        {raterRole === "homeowner" ? "Rate your tradie" : "Rate the customer"} · overall {overall.toFixed(1)}★
      </p>
      <div className="stack" style={{ gap: 6 }}>
        {dims.map(([k, label]) => <StarInput key={k} label={label} value={scores[k] ?? 5} onChange={(n) => set(k, n)} />)}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note (optional)…" style={{ minHeight: 64, marginTop: 12 }} />
      <button className="btn sm" style={{ marginTop: 10 }} disabled={busy} onClick={submit}>Submit rating</button>
      {err && <p className="err">{err}</p>}
    </div>
  );
}
