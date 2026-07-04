import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import type { JobDetail as JobDetailT, Quote } from "../types";
import { Icon, Spinner, money } from "../ui";
import { TriageView } from "./TriageView";
import { Thread } from "./Thread";

export function JobDetail() {
  const { id = "" } = useParams();
  const [job, setJob] = useState<JobDetailT | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [err, setErr] = useState("");
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const j = await api.job(id);
      setJob(j);
      if (j.status !== "DIY_RESOLVED" && j.status !== "DRAFT") {
        setQuotes(await api.jobQuotes(id));
      }
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

  if (err && !job) return <p className="err">{err}</p>;
  if (!job) return <Spinner />;

  const accepted = quotes.find((q) => q.status === "accepted");
  const canAccept = ["QUOTING", "POSTED"].includes(job.status);

  return (
    <div>
      <p className="eyebrow">Job · {job.status}</p>
      <h1 className="page-title">{job.triage?.job_spec?.title ?? `${job.category} · ${job.suburb}`}</h1>
      <p className="page-sub">{job.description}</p>

      {job.triage && <TriageView triage={job.triage} />}

      {job.status === "DIY_RESOLVED" && (
        <p className="notice" style={{ marginTop: 18 }}>
          This was a safe DIY job, so it wasn't posted to tradies. If you'd rather not tackle it, describe it
          again and let us know you'd like a pro.
        </p>
      )}

      {job.status !== "DIY_RESOLVED" && (
        <div style={{ marginTop: 22 }}>
          <p className="eyebrow">Private quotes {accepted ? "" : `· ${quotes.filter((q) => q.status === "submitted").length} in`}</p>

          {quotes.length === 0 && (
            <div className="notice">No quotes yet — matched tradies have been notified and quote privately. Sealed, so no tradie sees another's price.</div>
          )}

          <div className="list">
            {quotes.filter((q) => q.status !== "declined").map((q) => (
              <div className="tile" key={q.quote_id} style={q.status === "accepted" ? { borderColor: "var(--safe)" } : undefined}>
                <div className="top">
                  <h4>{q.tradie?.business_name ?? "Tradie"}</h4>
                  <span className="money">{money(q.amount)}</span>
                </div>
                <p className="desc">{q.inclusions}</p>
                <div className="tag-row" style={{ marginTop: 10 }}>
                  {q.tradie && <span className="tag">★ {q.tradie.rating_avg.toFixed(1)} · {q.tradie.jobs_completed} jobs</span>}
                  {q.earliest_availability && <span className="tag">from {q.earliest_availability}</span>}
                  <span className="tag" style={q.status === "accepted" ? { color: "var(--safe)" } : undefined}>{q.status}</span>
                </div>
                <div className="row wrap" style={{ marginTop: 12 }}>
                  {canAccept && q.status === "submitted" && (
                    <button className="btn sm" disabled={busy} onClick={() => accept(q.quote_id)}>Accept quote</button>
                  )}
                  <button className="btn ghost sm" onClick={() => setOpenThread(openThread === q.quote_id ? null : q.quote_id)}>
                    {openThread === q.quote_id ? "Hide messages" : "Message"}
                  </button>
                </div>
                {openThread === q.quote_id && <div style={{ marginTop: 12 }}><Thread threadId={q.quote_id} /></div>}
              </div>
            ))}
          </div>

          {accepted && job.booking && (
            <div className="card" style={{ marginTop: 16, borderColor: "var(--safe)" }}>
              <h3>{Icon.tick}Booked with {accepted.tradie?.business_name}</h3>
              <dl className="spec">
                <dt>Status</dt><dd>{job.booking.status}</dd>
                <dt>Address</dt><dd>{job.full_address ?? "shared with the tradie"}</dd>
                {job.booking.scheduled_for && (<><dt>Scheduled</dt><dd>{job.booking.scheduled_for}</dd></>)}
              </dl>
              {job.booking.status === "scheduled" && (
                <button className="btn sm" style={{ marginTop: 12 }} disabled={busy} onClick={complete}>Mark job completed</button>
              )}
              {job.status === "COMPLETED" && <ReviewForm bookingId={job.booking.id} onDone={load} />}
              {job.status === "REVIEWED" && <p className="notice" style={{ marginTop: 12 }}>Thanks — your review is in. This job is complete.</p>}
            </div>
          )}
        </div>
      )}
      {err && <p className="err">{err}</p>}
    </div>
  );
}

function ReviewForm({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async () => {
    setBusy(true); setErr("");
    try { await api.review(bookingId, rating, text); onDone(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ marginTop: 14, borderTop: "1px solid var(--hairline)", paddingTop: 14 }}>
      <p className="eyebrow" style={{ marginBottom: 8 }}>Leave a review</p>
      <div className="row" style={{ marginBottom: 10, gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className="icon-btn" aria-label={`${n} star`}
            style={{ color: n <= rating ? "var(--unclear)" : "var(--faint)", padding: "6px 8px" }}
            onClick={() => setRating(n)}>{Icon.star}</button>
        ))}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="How did it go?" style={{ minHeight: 70 }} />
      <button className="btn sm" style={{ marginTop: 10 }} disabled={busy} onClick={submit}>Submit review</button>
      {err && <p className="err">{err}</p>}
    </div>
  );
}
