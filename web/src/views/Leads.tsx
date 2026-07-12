import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { Lead, Review, WonLead } from "../types";
import { CATEGORY_META, Icon, Spinner, money } from "../ui";
import { timeAgo } from "../parts";
import { ReviewForm } from "./ReviewForm";

type Sort = "new" | "old" | "fewest";
type Tab = "quote" | "booked" | "money";

// UX #3 (trade side): speed-to-quote is the tradie's ranking lever — show it.
const QUOTE_SLA_MS = 2 * 3600 * 1000;
function SlaLine({ createdAt }: { createdAt: string }) {
  const left = QUOTE_SLA_MS - (Date.now() - new Date(createdAt).getTime());
  const late = left <= 0;
  const mins = Math.abs(Math.round(left / 60000));
  const label = late
    ? "Running late — quote now to protect your response rating"
    : `Quote within ${mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`} to keep your fast-response rating`;
  return (
    <span className={`sla-line ${late ? "late" : ""}`}>
      {Icon.clock}{label}
    </span>
  );
}

export function Leads() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [won, setWon] = useState<WonLead[]>([]);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>("quote");

  // filters
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [urgency, setUrgency] = useState("");
  const [hideQuoted, setHideQuoted] = useState(false);
  const [sort, setSort] = useState<Sort>("new");

  const reload = () => {
    Promise.all([api.leads(), api.wonLeads()])
      .then(([l, w]) => { setLeads(l); setWon(w); })
      .catch((e) => setErr(e.message));
  };
  useEffect(reload, []);

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

  // UX #5: the tradie's day is "what needs quoting, what's booked, what's paid".
  const booked = won.filter((w) => w.booking.status === "scheduled");
  const paidTotal = won.reduce((s, w) => s + (w.payment?.status === "captured" ? w.payment.trade_payout ?? 0 : 0), 0);
  const pendingTotal = won.reduce((s, w) => s + (w.payment?.status === "authorized" ? w.payment.trade_payout ?? 0 : 0), 0);
  const needsQuote = leads.filter((l) => !l.my_quote).length;

  return (
    <div>
      <p className="eyebrow">Your work</p>
      <h1 className="page-title">Jobs assigned to you</h1>
      <p className="page-sub">
        Pre-qualified jobs assigned to you — not auctioned. No pay-per-lead, no bidding wars. Send one firm
        quote (or just turn up for price-book work); the customer's details stay private until you're booked.
      </p>

      <div className="seg">
        <button className={tab === "quote" ? "active" : ""} onClick={() => setTab("quote")}>
          To quote{needsQuote > 0 ? ` (${needsQuote})` : ""}
        </button>
        <button className={tab === "booked" ? "active" : ""} onClick={() => setTab("booked")}>
          Booked{booked.length > 0 ? ` (${booked.length})` : ""}
        </button>
        <button className={tab === "money" ? "active" : ""} onClick={() => setTab("money")}>Money</button>
      </div>

      {tab === "booked" && (
        <div className="list">
          {booked.length === 0 && <div className="empty">Nothing booked in right now. Quotes you win land here.</div>}
          {booked.map((w) => <WonCard key={w.booking.id} won={w} onChange={reload} />)}
        </div>
      )}

      {tab === "money" && (
        <div>
          <div className="earnings">
            <div><span className="e-label">Paid to you</span><span className="e-amt">{money(paidTotal)}</span></div>
            <div><span className="e-label">Held for completed work</span><span className="e-amt">{money(pendingTotal)}</span></div>
          </div>
          <div className="list">
            {won.length === 0 && <div className="empty">No payouts yet — win your first job and the money lands here.</div>}
            {won.map((w) => <WonCard key={w.booking.id} won={w} onChange={reload} />)}
          </div>
        </div>
      )}

      {tab === "quote" && leads.length > 0 && (
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

      {tab === "quote" && leads.length > 0 && (
        <div className="filter-meta">
          <span>{filtered.length} of {leads.length} job{leads.length === 1 ? "" : "s"}</span>
          {active && <button className="filter-clear" onClick={clear}>Clear filters</button>}
        </div>
      )}

      {tab === "quote" && leads.length === 0 && <div className="empty">No open jobs match your profile right now. New ones will appear here.</div>}
      {tab === "quote" && leads.length > 0 && filtered.length === 0 && (
        <div className="empty">No jobs match these filters. <button className="filter-clear" onClick={clear}>Clear filters</button></div>
      )}

      {tab === "quote" && <div className="list">
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
              {l.status === "AWAITING_QUOTE" && !l.my_quote && <SlaLine createdAt={l.created_at} />}
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
      </div>}
    </div>
  );
}

function WonCard({ won, onChange }: { won: WonLead; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [showVar, setShowVar] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [varMsg, setVarMsg] = useState("");
  const p = won.payment;
  const scheduled = won.booking.status === "scheduled";

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr("");
    try { await fn(); onChange(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const draftVar = async () => {
    setDrafting(true); setErr("");
    try {
      const d = await api.draftVariation(won.booking.id, reason.trim());
      setAmount(String(d.amount / 100));
      setReason(d.reason);
      setVarMsg(d.customer_message);
    } catch (e) { setErr((e as Error).message); } finally { setDrafting(false); }
  };
  const proposeVar = () => {
    const cents = Math.round(Number(amount) * 100);
    if (!cents || cents <= 0) { setErr("Enter a valid variation amount."); return; }
    act(() => api.proposeVariation(won.booking.id, cents, reason.trim() || "Additional work"))
      .then(() => { setAmount(""); setReason(""); setVarMsg(""); setShowVar(false); });
  };

  return (
    <div className="feed-card" style={{ borderColor: p?.status === "captured" ? "var(--safe)" : "var(--hairline)" }}>
      <div className="fc-top">
        <h4>{won.job?.job_spec?.title ?? "Booked job"}</h4>
        <span className="urgency-pill routine" style={{ color: "var(--safe)", background: "var(--safe-bg)" }}>
          {p?.status === "captured" ? "paid" : won.booking.status === "scheduled" ? "booked" : won.booking.status}
        </span>
      </div>
      <div className="fc-meta"><span className="m">{Icon.pin}{won.job?.full_address ?? won.job?.suburb}</span></div>

      {p && (
        <dl className="payout" style={{ marginTop: 12 }}>
          <dt>Job price (GST incl.)</dt><dd>{money(p.amount_captured ?? p.amount_authorized)}</dd>
          <div className="fee" style={{ display: "contents" }}><dt>Platform fee (5%)</dt><dd>−{money(p.platform_fee ?? 0)}</dd></div>
          <div className="total" style={{ display: "contents" }}><dt>{p.status === "captured" ? "You received" : "You'll receive"}</dt><dd>{money(p.trade_payout ?? 0)}</dd></div>
        </dl>
      )}

      {won.variations.map((v) => (
        <div key={v.id} className="variation" style={{ marginTop: 8 }}>
          <div><div style={{ fontWeight: 650, fontSize: 13.5 }}>+{money(v.amount)}</div><div style={{ fontSize: 12.5, color: "var(--muted)" }}>{v.reason}</div></div>
          <span className="offer-status" style={{ background: "var(--surface-2)", color: v.status === "approved" ? "var(--safe)" : "var(--muted)" }}>{v.status}</span>
        </div>
      ))}

      {scheduled && (
        <div className="row wrap" style={{ marginTop: 12 }}>
          <button className="btn sm" disabled={busy} onClick={() => act(() => api.completeBooking(won.booking.id))}>Mark complete → get paid</button>
          <button className="btn ghost sm" onClick={() => setShowVar((s) => !s)}>{showVar ? "Cancel" : "Raise a variation"}</button>
        </div>
      )}
      {showVar && scheduled && (
        <div className="card" style={{ marginTop: 12, marginBottom: 0 }}>
          <p className="notice" style={{ marginBottom: 12 }}>The customer must approve extra work before it counts — it's added to the held payment.</p>
          <label className="field"><span className="lbl">What did you find on site?</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. the isolator switch also needs replacing" /></label>
          <div className="ai-draft-cta" style={{ marginBottom: 12 }}>
            <div><b>Price it with AI</b><span>Drafts a fair amount and a note for the customer from what you found.</span></div>
            <button className="btn ghost sm" type="button" disabled={drafting} onClick={draftVar}>{drafting ? "Drafting…" : "✨ Draft with AI"}</button>
          </div>
          <label className="field" style={{ marginBottom: varMsg ? 12 : 0 }}><span className="lbl">Extra amount (AUD)</span>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          {varMsg && (
            <div className="ai-msg" style={{ borderTop: "none", paddingTop: 0, marginTop: 0, marginBottom: 4 }}>
              <span className="lbl">Suggested note to the customer</span><p>{varMsg}</p>
            </div>
          )}
          <button className="btn sm" style={{ marginTop: 12 }} disabled={busy} onClick={proposeVar}>Send variation</button>
        </div>
      )}

      {won.booking.status === "completed" && !won.reviews.some((r) => r.rater_role === "tradie") && (
        <ReviewForm bookingId={won.booking.id} raterRole="tradie" onDone={onChange} />
      )}
      {won.reviews.some((r) => r.rater_role === "tradie") && (
        <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8 }}>You rated this customer {won.reviews.find((r) => r.rater_role === "tradie")!.overall}★.</p>
      )}

      {won.reviews.filter((r) => r.rater_role === "homeowner").map((r) => (
        <ReviewResponse key={r.id} review={r} onChange={onChange} />
      ))}
      {err && <p className="err">{err}</p>}
    </div>
  );
}

function ReviewResponse({ review, onChange }: { review: Review; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const draft = async () => {
    setDrafting(true); setErr("");
    try { const d = await api.draftReviewResponse(review.id); setText(d.response); }
    catch (e) { setErr((e as Error).message); } finally { setDrafting(false); }
  };
  const post = async () => {
    if (!text.trim()) { setErr("Write a response first."); return; }
    setBusy(true); setErr("");
    try { await api.respondToReview(review.id, text.trim()); onChange(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="review-block" style={{ marginTop: 12 }}>
      <div className="rb-head">
        <b>Customer left you {review.overall}★</b>
      </div>
      {review.text && <p className="rb-text">"{review.text}"</p>}
      {review.response ? (
        <div className="rb-response"><span className="lbl">Your response</span><p>{review.response}</p></div>
      ) : open ? (
        <div style={{ marginTop: 8 }}>
          <div className="ai-draft-cta" style={{ marginBottom: 10 }}>
            <div><b>Reply with AI</b><span>Drafts a warm, professional response you can edit.</span></div>
            <button className="btn ghost sm" type="button" disabled={drafting} onClick={draft}>{drafting ? "Drafting…" : "✨ Draft with AI"}</button>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 70, width: "100%" }} placeholder="Thanks so much for the review…" />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn sm" disabled={busy} onClick={post}>{busy ? "Posting…" : "Post response"}</button>
            <button className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>Respond to review</button>
      )}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
