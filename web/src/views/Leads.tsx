import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { Lead, WonLead } from "../types";
import { CATEGORY_META, Icon, Spinner, money } from "../ui";
import { timeAgo } from "../parts";

type Sort = "new" | "old" | "fewest";

export function Leads() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [won, setWon] = useState<WonLead[]>([]);
  const [err, setErr] = useState("");

  // filters
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [urgency, setUrgency] = useState("");
  const [hideQuoted, setHideQuoted] = useState(false);
  const [sort, setSort] = useState<Sort>("new");

  useEffect(() => {
    Promise.all([api.leads(), api.wonLeads()])
      .then(([l, w]) => { setLeads(l); setWon(w); })
      .catch((e) => setErr(e.message));
  }, []);

  const categories = useMemo(
    () => Array.from(new Set((leads ?? []).map((l) => l.category))),
    [leads],
  );

  const filtered = useMemo(() => {
    let out = (leads ?? []).slice();
    const needle = q.trim().toLowerCase();
    if (needle) {
      out = out.filter((l) =>
        (l.job_spec?.title ?? "").toLowerCase().includes(needle) ||
        (l.job_spec?.summary ?? "").toLowerCase().includes(needle) ||
        l.suburb.toLowerCase().includes(needle),
      );
    }
    if (cat) out = out.filter((l) => l.category === cat);
    if (urgency) out = out.filter((l) => l.urgency === urgency);
    if (hideQuoted) out = out.filter((l) => !l.my_quote);
    out.sort((a, b) => {
      if (sort === "fewest") return a.quote_count - b.quote_count;
      const cmp = a.created_at.localeCompare(b.created_at);
      return sort === "new" ? -cmp : cmp;
    });
    return out;
  }, [leads, q, cat, urgency, hideQuoted, sort]);

  const active = Boolean(q || cat || urgency || hideQuoted || sort !== "new");
  const clear = () => { setQ(""); setCat(""); setUrgency(""); setHideQuoted(false); setSort("new"); };

  if (err) return <p className="err">{err}</p>;
  if (!leads) return <Spinner />;

  return (
    <div>
      <p className="eyebrow">Your work</p>
      <h1 className="page-title">Jobs assigned to you</h1>
      <p className="page-sub">
        Pre-qualified jobs assigned to you — not auctioned. No pay-per-lead, no bidding wars. Send one firm
        quote (or just turn up for price-book work); the customer's details stay private until you're booked.
      </p>

      {leads.length > 0 && (
        <div className="filterbar">
          <div className="search">
            {Icon.search}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search jobs by title, summary or suburb…" />
          </div>
          <div className="filter-row">
            {categories.length > 1 && (
              <>
                <button className={`chip ${cat === "" ? "active" : ""}`} onClick={() => setCat("")}>All trades</button>
                {categories.map((c) => (
                  <button key={c} className={`chip ${cat === c ? "active" : ""}`} onClick={() => setCat(c)}>
                    {CATEGORY_META[c]?.label ?? c}
                  </button>
                ))}
                <span style={{ width: 1, alignSelf: "stretch", background: "var(--hairline)", margin: "0 2px" }} />
              </>
            )}
            <select className="filter-select" value={urgency} onChange={(e) => setUrgency(e.target.value)}>
              <option value="">Any urgency</option>
              <option value="emergency">Emergency</option>
              <option value="urgent">Urgent</option>
              <option value="routine">Routine</option>
            </select>
            <select className="filter-select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="new">Newest first</option>
              <option value="old">Oldest first</option>
              <option value="fewest">Fewest quotes</option>
            </select>
            <label className="filter-toggle">
              <input type="checkbox" checked={hideQuoted} onChange={(e) => setHideQuoted(e.target.checked)} />
              Hide jobs I've quoted
            </label>
          </div>
        </div>
      )}

      {leads.length > 0 && (
        <div className="filter-meta">
          <span>{filtered.length} of {leads.length} job{leads.length === 1 ? "" : "s"}</span>
          {active && <button className="filter-clear" onClick={clear}>Clear filters</button>}
        </div>
      )}

      {leads.length === 0 && <div className="empty">No open jobs match your profile right now. New ones will appear here.</div>}
      {leads.length > 0 && filtered.length === 0 && (
        <div className="empty">No jobs match these filters. <button className="filter-clear" onClick={clear}>Clear filters</button></div>
      )}

      <div className="list">
        {filtered.map((l) => {
          const meta = CATEGORY_META[l.category] ?? CATEGORY_META.other!;
          return (
            <Link className="feed-card" to={`/leads/${l.job_id}`} key={l.job_id}>
              <div className="fc-top">
                <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
                  <span style={{ width: 40, height: 40, borderRadius: 11, display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)", flex: "none" }}>
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
                  {l.status === "AWAITING_QUOTE"
                    ? "Assigned to you — send a firm quote"
                    : l.status === "QUOTED"
                      ? "Quoted — waiting on the customer"
                      : l.status === "BOOKED"
                        ? "Booked"
                        : "Assigned to you"}
                </span>
                {l.my_quote
                  ? <span className="offer-status accepted" style={{ background: "var(--safe-bg)", color: "var(--safe)" }}>Your price {money(l.my_quote.amount)}</span>
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
