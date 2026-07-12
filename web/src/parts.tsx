import type { ReactNode } from "react";
import { Icon } from "./ui";
import type { TradieSummary } from "./types";

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

export function Badge({ tone, icon, children }: { tone: "safe" | "accent" | "muted"; icon?: keyof typeof Icon; children: ReactNode }) {
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
