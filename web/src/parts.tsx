import { useState, type ReactNode } from "react";
import { Icon } from "./ui";
import type { TradieSummary } from "./types";

/**
 * The clarify-and-refine loop (M1 conversational intake, mechanics built now):
 * the concierge's questions each get an answer box; answers are folded back
 * into the description and triage runs again. Only the ANSWERS are folded —
 * folding question text would let phrases like "burning smell" inside a
 * question trip the keyword brain. The live model replaces the brain, not
 * this loop.
 */
export function ClarifyForm({ questions, busy, onAnswers, onSkip }: {
  questions: string[];
  busy?: boolean;
  onAnswers: (foldedAnswers: string) => void;
  onSkip?: () => void;
}) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));
  const filled = answers.some((a) => a.trim());
  return (
    <div className="card" style={{ borderColor: "var(--accent)" }}>
      <h3>{Icon.quest}A few quick questions</h3>
      <p className="notice" style={{ marginBottom: 12 }}>
        Twenty seconds here gets you routed right the first time — answer what you can.
      </p>
      {questions.map((q, i) => (
        <label className="field" key={q} style={{ marginBottom: 10 }}>
          <span className="lbl">{q}</span>
          <input
            value={answers[i]}
            onChange={(e) => setAnswers((a) => a.map((x, n) => (n === i ? e.target.value : x)))}
            placeholder="Type your answer…"
          />
        </label>
      ))}
      <div className="row wrap" style={{ gap: 8, marginTop: 6 }}>
        <button className="btn" disabled={!filled || busy}
          onClick={() => onAnswers(answers.map((a) => a.trim()).filter(Boolean).join(". "))}>
          {busy ? "Checking…" : "Send answers →"}
        </button>
        {onSkip && (
          <button className="btn ghost" disabled={busy} onClick={onSkip}>
            Skip — sort it with what I've told you
          </button>
        )}
      </div>
    </div>
  );
}

/** Relative "posted 2h ago" style time (browser clock; fine for display). */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-AU", { month: "short", year: "numeric" });
}

export function memberSince(iso: string | null): string {
  if (!iso) return "";
  return `Member since ${new Date(iso).getFullYear()}`;
}

/** Deterministic warm avatar colour from a name. */
const AV_TONES = [
  ["var(--accent)", "#fff"],
  ["var(--safe)", "#fff"],
  ["var(--pro)", "#fff"],
  ["var(--unclear)", "#fff"],
] as const;

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const [bg, fg] = AV_TONES[h % AV_TONES.length]!;
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function Stars({ value, count }: { value: number; count?: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span className="stars" title={`${value.toFixed(1)} out of 5`}>
      <span className="stars-track">
        {[0, 1, 2, 3, 4].map((i) => <span className="star" key={i}>{Icon.starFill}</span>)}
        <span className="stars-fill" style={{ width: `${pct}%` }}>
          {[0, 1, 2, 3, 4].map((i) => <span className="star on" key={i}>{Icon.starFill}</span>)}
        </span>
      </span>
      <b>{value.toFixed(1)}</b>
      {count !== undefined && <span className="stars-count">({count})</span>}
    </span>
  );
}

export function Badge({ tone, icon, children }: { tone: "safe" | "accent" | "muted" | "gold"; icon?: keyof typeof Icon; children: ReactNode }) {
  return (
    <span className={`trust-badge t-${tone}`}>
      {icon && <span className="tb-ico">{Icon[icon]}</span>}
      {children}
    </span>
  );
}

/** The Airtasker-style trust strip for a tradie. */
export function TrustRow({ tradie }: { tradie: TradieSummary }) {
  return (
    <div className="trust-row">
      {tradie.gold && (
        <span title="Gold tradie — consistently 5-star: great communication, jobs completed as quoted, fair prices">
          <Badge tone="gold" icon="star">Gold tradie</Badge>
        </span>
      )}
      {tradie.verified && <Badge tone="safe" icon="tick">Verified</Badge>}
      {tradie.licence_verified && <Badge tone="safe" icon="shield">Licence checked</Badge>}
      {tradie.insured && <Badge tone="muted" icon="doc">Insured</Badge>}
      {tradie.response_minutes !== null && (
        <Badge tone="muted" icon="clock">Replies in ~{fmtMins(tradie.response_minutes)}</Badge>
      )}
    </div>
  );
}

function fmtMins(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return `${h}h`;
}

const JOB_STEPS = [
  { key: "ASSIGNED", label: "Tradie assigned" },
  { key: "QUOTED", label: "Price ready" },
  { key: "BOOKED", label: "Booked in" },
  { key: "COMPLETED", label: "Done" },
];
const STEP_INDEX: Record<string, number> = {
  TRIAGED: 0, AWAITING_QUOTE: 0, QUOTED: 1, BOOKED: 2, COMPLETED: 3, REVIEWED: 3,
};

export function Stepper({ status }: { status: string }) {
  const active = STEP_INDEX[status] ?? 0;
  return (
    <ol className="stepper">
      {JOB_STEPS.map((s, i) => (
        <li key={s.key} className={i < active ? "done" : i === active ? "current" : ""}>
          <span className="dot">{i < active ? Icon.tick : i + 1}</span>
          <span className="lbl">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}
