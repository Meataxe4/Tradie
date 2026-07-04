import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { Lead, WonLead } from "../types";
import { Spinner, money } from "../ui";

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
      <p className="eyebrow">Tradie</p>
      <h1 className="page-title">Matched leads</h1>
      <p className="page-sub">
        Jobs matched to your trade, service area and verified licence. No pay-to-quote — the homeowner's identity
        stays masked until you win the job.
      </p>

      {leads.length === 0 && <div className="empty">No open leads right now. New matching jobs will appear here.</div>}

      <div className="list">
        {leads.map((l) => (
          <Link className="tile" to={`/leads/${l.job_id}`} key={l.job_id}>
            <div className="top">
              <h4>{l.job_spec?.title ?? l.category}</h4>
              <span className="status" style={l.urgency === "emergency" ? { color: "var(--emergency)" } : undefined}>{l.urgency}</span>
            </div>
            <p className="desc">{l.suburb} · {l.job_spec?.summary ?? l.category}</p>
            <div className="tag-row" style={{ marginTop: 10 }}>
              {l.required_licence_class && <span className="tag">{l.required_licence_class}</span>}
              {l.my_quote && <span className="tag" style={{ color: "var(--safe)" }}>you quoted {money(l.my_quote.amount)}</span>}
            </div>
          </Link>
        ))}
      </div>

      {won.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <p className="eyebrow">Won jobs</p>
          <div className="list">
            {won.map((w) => (
              <Link className="tile" to={`/leads/${w.job?.job_id}`} key={w.booking.id} style={{ borderColor: "var(--safe)" }}>
                <div className="top">
                  <h4>{w.job?.job_spec?.title ?? "Booked job"}</h4>
                  <span className="status" style={{ color: "var(--safe)" }}>{w.booking.status}</span>
                </div>
                <p className="desc">{w.job?.full_address ?? w.job?.suburb}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
