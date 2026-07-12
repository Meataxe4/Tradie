import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { AdminOverview } from "../types";
import { Icon, Spinner, money, tradeName } from "../ui";
import { timeAgo } from "../parts";

/**
 * UX #7 — the ops dashboard. One screen for the business owner: the money and
 * conversion KPIs, the post→review funnel, and the three operational queues
 * (safety-gate overrides, contact-leakage attempts, tradie verification).
 *
 * Chart notes: the funnel is a single measure, so it uses ONE hue (the copper
 * accent) with direct count labels in ink — colour never carries identity here.
 * Queue tones reuse the app's reserved status colours, always with a label.
 */
export function Admin() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    api.adminOverview().then(setData).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const verify = async (id: string) => {
    setBusy(id); setErr("");
    try { await api.verifyTradie(id); load(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(""); }
  };

  if (err && !data) return <p className="err">{err}</p>;
  if (!data) return <Spinner />;

  const s = data.stats;
  const posted = data.funnel[0]?.count ?? 0;

  return (
    <div>
      <p className="eyebrow">Operations</p>
      <h1 className="page-title">How the marketplace is running</h1>
      <p className="page-sub">Money, conversion and the three queues that need your eyes — safety overrides, off-platform attempts, and tradies waiting on verification.</p>

      {/* KPI stat tiles */}
      <div className="kpis">
        <div className="kpi"><span className="k-label">GMV (captured)</span><span className="k-val">{money(s.gmv)}</span><span className="k-sub">jobs paid out</span></div>
        <div className="kpi"><span className="k-label">Platform revenue</span><span className="k-val">{money(s.revenue)}</span><span className="k-sub">5% of captured</span></div>
        <div className="kpi"><span className="k-label">Held in escrow</span><span className="k-val">{money(s.held)}</span><span className="k-sub">booked, not yet done</span></div>
        <div className="kpi"><span className="k-label">Quote acceptance</span><span className="k-val">{s.acceptance_rate === null ? "—" : `${Math.round(s.acceptance_rate * 100)}%`}</span><span className="k-sub">accepted ÷ sent</span></div>
      </div>

      {/* Conversion funnel — one hue, direct labels */}
      <div className="card">
        <h3>{Icon.doc}Conversion funnel</h3>
        <div className="funnel">
          {data.funnel.map((f) => {
            const pct = posted > 0 ? f.count / posted : 0;
            return (
              <div className="f-row" key={f.key}>
                <span className="f-label">{f.label}</span>
                <span className="f-track"><span className="f-bar" style={{ width: `${Math.max(pct * 100, f.count > 0 ? 3 : 0)}%` }} /></span>
                <span className="f-count">{f.count}<em>{posted > 0 ? ` · ${Math.round(pct * 100)}%` : ""}</em></span>
              </div>
            );
          })}
        </div>
        <p className="f-side">
          Outside the funnel: <b>{s.diy_resolved}</b> resolved as safe DIY · <b>{s.declined}</b> declined ·{" "}
          <b>{s.tradies_verified}/{s.tradies_total}</b> tradies verified
        </p>
      </div>

      {/* Queue 1: verification — supply activation */}
      <div className="card">
        <h3>{Icon.shield}Verification queue <span className="q-count">{data.verification.length}</span></h3>
        {data.verification.length === 0 && <p className="notice">No tradies waiting — supply is fully verified.</p>}
        {data.verification.map((t) => (
          <div className="q-row" key={t.user_id}>
            <div>
              <b>{t.business_name}</b>
              <span>{t.trades.map(tradeName).join(", ") || "no trades listed"} · ABN {t.abn || "—"}{t.licences[0] ? ` · ${t.licences[0].class} ${t.licences[0].number} (${t.licences[0].state})` : " · no licence supplied"}</span>
            </div>
            <button className="btn sm" disabled={busy === t.user_id} onClick={() => verify(t.user_id)}>
              {busy === t.user_id ? "Verifying…" : "Verify"}
            </button>
          </div>
        ))}
      </div>

      {/* Queue 2: safety-gate overrides — prompt drift monitor */}
      <div className="card">
        <h3>{Icon.pro}Safety-gate overrides <span className="q-count">{data.overrides.length}</span></h3>
        <p className="notice" style={{ marginBottom: data.overrides.length ? 12 : 0 }}>
          Every time the server-side gate corrected the model. A spike here means the triage prompt is drifting — review before it becomes a safety problem.
        </p>
        {data.overrides.map((o, i) => (
          <div className="q-row" key={i}>
            <div>
              <b className="q-tone warn">⚠ {o.overrides.map((x) => x.reason.replace(/_/g, " ")).join(" · ")}</b>
              <span>{o.overrides.map((x) => `${x.from_verdict} → ${x.to_verdict}`).join(" · ")} · job {o.job_id.slice(0, 8)} · {timeAgo(o.at)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Queue 3: leakage — take-rate defence */}
      <div className="card">
        <h3>{Icon.chat}Contact-leakage attempts <span className="q-count">{data.leakage.length}</span></h3>
        <p className="notice" style={{ marginBottom: data.leakage.length ? 12 : 0 }}>
          Messages where a phone/email was redacted — someone tried to take a job off-platform.
        </p>
        {data.leakage.map((l, i) => (
          <div className="q-row" key={i}>
            <div>
              <b className="q-tone serious">✕ Redacted message from the {l.sender_role}</b>
              <span>thread {l.thread_id.slice(0, 8)} · {timeAgo(l.at)}</span>
            </div>
          </div>
        ))}
      </div>

      {err && <p className="err">{err}</p>}
    </div>
  );
}
