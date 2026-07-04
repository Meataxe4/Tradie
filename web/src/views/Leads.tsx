import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { Lead, WonLead } from "../types";
import { CATEGORY_META, Icon, Spinner, money } from "../ui";
import { timeAgo } from "../parts";

export function Leads() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [won, setWon] = useState<WonLead[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    Promise.all([api.leads(), api.wonLeads()])
      .then(([l, w]) => { setLeads(l); setWon(w); })
      .catch((e) => setErr(e.message));
  }, []);

  if (err) return <p className="err">{err}</p>;
  if (!leads) return <Spinner />;

  return (
    <div>
      <p className="eyebrow">Browse jobs</p>
      <h1 className="page-title">Jobs matched to you</h1>
      <p className="page-sub">
        Only jobs in your trade, service area and verified licence class. No pay-to-quote — and the homeowner
        stays private until you win the work.
      </p>

      {leads.length === 0 && <div className="empty">No open jobs match your profile right now. New ones will appear here.</div>}

      <div className="list">
        {leads.map((l) => {
          const meta = CATEGORY_META[l.category] ?? CATEGORY_META.other!;
          return (
            <Link className="feed-card" to={`/leads/${l.job_id}`} key={l.job_id}>
              <div className="fc-top">
                <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
                  <span className="ci" style={{ width: 40, height: 40, borderRadius: 11, display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)", flex: "none" }}>
                    {Icon[meta.icon]}
                  </span>
                  <div>
                    <h4>{l.job_spec?.title ?? meta.label}</h4>
                    <div className="fc-meta">
                      <span className="m">{Icon.pin}{l.suburb}</span>
                      <span className="m">{Icon.clock}posted {timeAgo(l.created_at)}</span>
                      {l.required_licence_class && <span className="m">{Icon.shield}{l.required_licence_class}</span>}
                    </div>
                  </div>
                </div>
                <span className={`urgency-pill ${l.urgency}`}>{l.urgency}</span>
              </div>
              <div className="fc-foot">
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  {l.quote_count === 0 ? "Be the first to quote" : `${l.quote_count} quote${l.quote_count === 1 ? "" : "s"} so far`}
                </span>
                {l.my_quote
                  ? <span className="offer-status accepted" style={{ background: "var(--safe-bg)", color: "var(--safe)" }}>You quoted {money(l.my_quote.amount)}</span>
                  : <span className="btn sm" style={{ pointerEvents: "none" }}>View &amp; quote →</span>}
              </div>
            </Link>
          );
        })}
      </div>

      {won.length > 0 && (
        <div style={{ marginTop: 30 }}>
          <p className="eyebrow">Jobs you've won</p>
          <div className="list">
            {won.map((w) => (
              <Link className="feed-card" to={`/leads/${w.job?.job_id}`} key={w.booking.id} style={{ borderColor: "var(--safe)" }}>
                <div className="fc-top">
                  <h4>{w.job?.job_spec?.title ?? "Booked job"}</h4>
                  <span className="urgency-pill routine" style={{ color: "var(--safe)", background: "var(--safe-bg)" }}>{w.booking.status}</span>
                </div>
                <div className="fc-meta"><span className="m">{Icon.pin}{w.job?.full_address ?? w.job?.suburb}</span></div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
