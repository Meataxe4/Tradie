import type { ReactNode } from "react";
import type { Override, TriageResult, Verdict } from "./types";

export const Icon = {
  stop: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /></svg>
  ),
  tick: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></svg>
  ),
  pro: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7h-9" /><path d="M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></svg>
  ),
  quest: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
  ),
  tools: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>
  ),
  doc: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /></svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
  ),
  stopSmall: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 2.5 14 8l6 .5-4.5 4 1.4 6L11.5 15 6 18.5 7.5 12.5 3 8.5 9 8z" /></svg>
  ),
  starFill: (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2.5l2.7 5.9 6.3.6-4.8 4.2 1.5 6.3L12 16.9 6.3 19.5l1.5-6.3L3 9l6.3-.6z" /></svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  ),
  pin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></svg>
  ),
  camera: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
  ),
  arrow: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
  ),
  bolt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9z" /></svg>
  ),
  drop: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.5S5 10 5 14.5a7 7 0 0 0 14 0C19 10 12 2.5 12 2.5z" /></svg>
  ),
  flame: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2c1 3-1.5 4.5-2.5 6S8 12 8 12a4 4 0 1 0 7 2.5c0-2-1-3.5-1-3.5 2 .5 3 2.5 3 4a6 6 0 1 1-11.5-2.3C4.8 8.5 8 7 8 4c1.6.8 4 .5 4-2z" /></svg>
  ),
  snow: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M2 12h20m-3-6-14 12m0-12 14 12" /></svg>
  ),
  key: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.5 12.5 8-8m-3 3 2 2m-4-4 2 2" /></svg>
  ),
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>
  ),
};

export const CATEGORY_META: Record<string, { label: string; icon: keyof typeof Icon }> = {
  electrical: { label: "Electrical", icon: "bolt" },
  plumbing_water: { label: "Plumbing", icon: "drop" },
  gas: { label: "Gas", icon: "flame" },
  hvac: { label: "Heating & cooling", icon: "snow" },
  structural: { label: "Structural", icon: "home" },
  carpentry: { label: "Carpentry", icon: "tools" },
  appliance: { label: "Appliances", icon: "bolt" },
  locksmith: { label: "Locksmith", icon: "key" },
  handyman: { label: "Handyman", icon: "tools" },
  other: { label: "Other", icon: "tools" },
};

const VMETA: Record<Verdict, { cls: string; ico: ReactNode; label: string }> = {
  DIY_SAFE: { cls: "v-safe", ico: Icon.tick, label: "You can do this safely" },
  NEEDS_LICENSED_PRO: { cls: "v-pro", ico: Icon.pro, label: "Needs a licensed tradesperson" },
  EMERGENCY_STOP: { cls: "v-emergency", ico: Icon.stop, label: "Act now — safety first" },
  UNCLEAR: { cls: "v-unclear", ico: Icon.quest, label: "A few more details, please" },
};

export function money(cents: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
}

export function tradeName(t: string): string {
  return t.replace(/_/g, " ");
}

export function VerdictBanner({ t }: { t: TriageResult }) {
  const vm = VMETA[t.verdict];
  const tags: string[] = [t.category];
  t.regulated_domains.forEach((d) => d !== "none" && tags.push(`reg: ${d}`));
  t.safety_flags.forEach((f) => f !== "none" && tags.push(`flag: ${f}`));
  if (t.recommended_trade !== "none") tags.push(tradeName(t.recommended_trade));
  return (
    <div className={`verdict ${vm.cls}`}>
      <span className="ico" aria-hidden="true">{vm.ico}</span>
      <div>
        <div className="code">{t.verdict}</div>
        <h2>{vm.label}</h2>
        <p>{t.user_message}</p>
        <div className="tag-row" style={{ marginTop: 13 }}>
          {tags.map((x) => <span className="tag" key={x}>{x}</span>)}
        </div>
      </div>
    </div>
  );
}

export function GatePanel({ overrides, modelVerdict, finalVerdict }: {
  overrides: Override[];
  modelVerdict: Verdict;
  finalVerdict: Verdict;
}) {
  const changed = finalVerdict !== modelVerdict;
  const hasOvr = overrides.length > 0;
  return (
    <div className="gate">
      <div className="gate-head">
        <span className="shield" style={{ color: hasOvr ? "var(--emergency)" : "var(--accent)" }} aria-hidden="true">{Icon.shield}</span>
        <div className="t">
          <b>Server-side safety gate</b>
          <span>Defence in depth — runs after the AI and can only escalate risk, never lower it.</span>
        </div>
        <span className={`badge ${hasOvr ? "override" : "clean"}`}>
          {hasOvr ? `${overrides.length} override${overrides.length > 1 ? "s" : ""}` : "no changes"}
        </span>
      </div>
      <div className="gate-body">
        <div className="flow">
          <span className="v from">AI said · {modelVerdict}</span>
          <span className="arrow">→</span>
          <span className={`v to ${changed ? "changed" : "same"}`}>Gate returned · {finalVerdict}</span>
        </div>
        {hasOvr ? (
          <ul className="ovr">
            {overrides.map((o, i) => (
              <li key={i}><code>{o.reason}</code><span>{o.detail}</span></li>
            ))}
          </ul>
        ) : (
          <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0 }}>
            The AI's answer already complied with the safety policy — nothing to override.
          </p>
        )}
      </div>
    </div>
  );
}

export function Spinner() {
  return <div className="center"><div className="spin" role="status" aria-label="Loading" /></div>;
}
