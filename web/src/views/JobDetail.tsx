import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import type { JobDetail as JobDetailT, Quote } from "../types";
import { Icon, Spinner, money } from "../ui";
import { Avatar, Stars, Stepper, TrustRow, timeAgo, memberSince } from "../parts";
import { TriageView } from "./TriageView";
import { Thread } from "./Thread";
import { ReviewForm } from "./ReviewForm";

export function JobDetail() {
  const { id = "" } = useParams();
  const [job, setJob] = useState<JobDetailT | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [err, setErr] = useState("");
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showTriage, setShowTriage] = useState(false);

  const load = useCallback(async () => {
    try {
      const j = await api.job(id);
      setJob(j);
      if (j.status !== "DIY_RESOLVED" && j.status !== "DRAFT") setQuotes(await api.jobQuotes(id));
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const accept = async (quoteId: string) => {
    setBusy(true); setErr("");
    try { await api.acceptQuote(quoteId); await load(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  const complete = async () => {
    if (!job?.booking) return;
    setBusy(true);
    try { await api.completeBooking(job.booking.id); await load(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const decideVariation = async (id: string, approve: boolean) => {
    setBusy(true); setErr("");
    try { approve ? await api.approveVariation(id) : await api.declineVariation(id); await load(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  if (err && !job) return <p className="err">{err}</p>;
  if (!job) return <Spinner />;

  const accepted = quotes.find((q) => q.status === "accepted");
  const canAccept = job.status === "QUOTED";
  const live = quotes.filter((q) => q.status !== "declined");
  const isPro = job.status !== "DIY_RESOLVED" && job.status !== "DRAFT";
  const awaiting = job.status === "AWAITING_QUOTE";
  const priceBook = job.triage?.recommended_trade;
  const assignedName = live[0]?.tradie?.business_name;

  return (
    <div>
      <p className="eyebrow">{job.category} · {job.suburb} · posted {timeAgo(job.created_at)}</p>
      <h1 className="page-title">{job.triage?.job_spec?.title ?? `${job.category} · ${job.suburb}`}</h1>
      <p className="page-sub">{job.description}</p>

      {isPro && <Stepper status={job.status} />}

      {job.status === "DIY_RESOLVED" ? (
        <>
          {job.triage && <TriageView triage={job.triage} />}
          <p className="notice" style={{ marginTop: 16 }}>
            This was a safe DIY job, so it wasn't posted to tradies. Prefer a pro? Describe it again and say you'd
            rather not tackle it yourself.
          </p>
        </>
      ) : (
        <>
          {/* Quotes are the star of this screen (Airtasker-style). Triage is tucked behind a toggle. */}
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <p className="eyebrow" style={{ margin: 0 }}>
              {accepted ? "Your booking" : awaiting ? "Getting your quote" : "Your firm quote"}
            </p>
            <button className="btn ghost sm" onClick={() => setShowTriage((s) => !s)}>
              {showTriage ? "Hide triage details" : "View triage details"}
            </button>
          </div>

          {showTriage && job.triage && <div style={{ marginBottom: 18 }}><TriageView triage={job.triage} /></div>}

          {awaiting && (
            <div className="notice" style={{ marginBottom: 16 }}>
              {assignedName
                ? `We've assigned ${assignedName} — a vetted, licensed ${(priceBook ?? "trade").replace("_", " ")}. They have all your details and will send one firm price shortly. No bidding wars, no chasing.`
                : `We're assigning a vetted, licensed ${(priceBook ?? "trade").replace("_", " ")} in your area — your firm quote will appear here shortly.`}
            </div>
          )}

          <div className="list">
            {live.map((q) => {
              const t = q.tradie;
              return (
                <div className={`offer ${q.status === "accepted" ? "won" : ""}`} key={q.quote_id}>
                  <div className="offer-head">
                    {t && <Avatar name={t.business_name} />}
                    <div className="offer-who">
                      <div className="offer-name">{t?.business_name ?? "Tradie"}</div>
                      <div className="offer-sub">
                        {t && <Stars value={t.rating_avg} count={t.jobs_completed} />}
                        {t?.member_since && <span>· {memberSince(t.member_since)}</span>}
                      </div>
                    </div>
                    <div className="offer-price">
                      <div className="amt">{money(q.amount)}</div>
                      {q.earliest_availability && <div className="avail">from {q.earliest_availability}</div>}
                    </div>
                  </div>
                  <p className="offer-incl">{q.inclusions}</p>
                  {q.kind === "price_book" && (
                    <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "6px 0 0" }}>Firm, GST-inclusive price from our price book — no site visit needed.</p>
                  )}
                  {t && <TrustRow tradie={t} />}
                  {t && t.strengths.length > 0 && (
                    <div className="strengths">
                      {t.strengths.map((s) => <span className="strength" key={s}>{Icon.starFill}{s}</span>)}
                    </div>
                  )}
                  <div className="offer-actions">
                    {canAccept && q.status === "offered" && (
                      <button className="btn sm" disabled={busy} onClick={() => accept(q.quote_id)}>Accept &amp; book</button>
                    )}
                    {q.status === "accepted" && <span className="offer-status accepted">✓ Booked</span>}
                    <button className="btn ghost sm" onClick={() => setOpenThread(openThread === q.quote_id ? null : q.quote_id)}>
                      {openThread === q.quote_id ? "Hide messages" : "Message"}
                    </button>
                  </div>
                  {openThread === q.quote_id && <div style={{ marginTop: 14 }}><Thread threadId={q.quote_id} /></div>}
                </div>
              );
            })}
          </div>

          {accepted && job.booking && (
            <div className="card" style={{ marginTop: 16, borderColor: "var(--safe)" }}>
              <h3>{Icon.tick}You're booked with {accepted.tradie?.business_name}</h3>
              <dl className="spec">
                <dt>Status</dt><dd>{job.booking.status}</dd>
                <dt>Your address</dt><dd>{job.full_address ?? "shared with your tradie"}</dd>
                {job.booking.scheduled_for && (<><dt>Scheduled</dt><dd>{job.booking.scheduled_for}</dd></>)}
              </dl>

              {job.payment && (
                <div className="pay-line" style={{ marginTop: 12 }}>
                  {job.payment.status === "authorized" ? (
                    <>{Icon.shield}<span><b>{money(job.payment.amount_authorized)} held securely.</b> You're only charged when the job's marked complete — no surprises.</span></>
                  ) : job.payment.status === "captured" ? (
                    <>{Icon.tick}<span><b>Paid {money(job.payment.amount_captured ?? job.payment.amount_authorized)}.</b> Released to your tradie on completion.</span></>
                  ) : null}
                </div>
              )}

              {job.variations.map((v) => (
                <div key={v.id} className="variation">
                  <div>
                    <div style={{ fontWeight: 650, fontSize: 14 }}>Variation: +{money(v.amount)}</div>
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>{v.reason}</div>
                  </div>
                  {v.status === "proposed" ? (
                    <div className="row" style={{ gap: 8 }}>
                      <button className="btn sm" disabled={busy} onClick={() => decideVariation(v.id, true)}>Approve</button>
                      <button className="btn ghost sm" disabled={busy} onClick={() => decideVariation(v.id, false)}>Decline</button>
                    </div>
                  ) : (
                    <span className="offer-status" style={{ color: v.status === "approved" ? "var(--safe)" : "var(--muted)", background: "var(--surface-2)" }}>{v.status}</span>
                  )}
                </div>
              ))}

              {job.booking.status === "scheduled" && (
                <button className="btn sm" style={{ marginTop: 12 }} disabled={busy} onClick={complete}>Mark job completed</button>
              )}
              {job.booking.status === "completed" && !job.reviews.some((r) => r.rater_role === "homeowner") && (
                <ReviewForm bookingId={job.booking.id} raterRole="homeowner" onDone={load} />
              )}
              {job.reviews.some((r) => r.rater_role === "homeowner") && (
                <p className="notice" style={{ marginTop: 12 }}>Thanks — your rating's in. This job is complete. 🎉</p>
              )}
              {job.reviews.some((r) => r.rater_role === "tradie") && (
                <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8 }}>Your tradie rated you {job.reviews.find((r) => r.rater_role === "tradie")!.overall}★.</p>
              )}
            </div>
          )}
        </>
      )}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
