import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import type { Lead } from "../types";
import { Icon, Spinner, money, tradeName } from "../ui";
import { Thread } from "./Thread";

export function LeadDetail() {
  const { id = "" } = useParams();
  const [lead, setLead] = useState<Lead | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try { setLead(await api.lead(id)); }
    catch (e) { setErr((e as Error).message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (err && !lead) return <p className="err">{err}</p>;
  if (!lead) return <Spinner />;

  const spec = lead.job_spec;
  const won = Boolean(lead.full_address);

  return (
    <div>
      <p className="eyebrow">Lead · {lead.urgency}</p>
      <h1 className="page-title">{spec?.title ?? lead.category}</h1>
      <p className="page-sub">{spec?.summary}</p>

      <div className="card">
        <h3>{Icon.doc}Job spec</h3>
        <dl className="spec">
          <dt>Trade</dt><dd>{tradeName(lead.category)}</dd>
          {lead.required_licence_class && (<><dt>Licence</dt><dd>{lead.required_licence_class}</dd></>)}
          <dt>Location</dt><dd>{won ? lead.full_address : `${lead.suburb} · full address revealed when you win`}</dd>
          {spec?.symptoms?.length ? (<><dt>Symptoms</dt><dd><ul>{spec.symptoms.map((s, i) => <li key={i}>{s}</li>)}</ul></dd></>) : null}
          {spec?.questions_for_site_visit?.length ? (
            <><dt>On-site checks</dt><dd><ul>{spec.questions_for_site_visit.map((q, i) => <li key={i}>{q}</li>)}</ul></dd></>
          ) : null}
          {lead.why_pro_needed && (<><dt>Why licensed</dt><dd>{lead.why_pro_needed}</dd></>)}
          <dt>Homeowner</dt><dd style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 12 }}>{won ? "revealed" : "masked until booked"}</dd>
        </dl>
      </div>

      {lead.my_quote ? (
        <div className="card" style={{ borderColor: lead.my_quote.status === "accepted" ? "var(--safe)" : undefined }}>
          <h3>{Icon.tick}Your quote</h3>
          <dl className="spec">
            <dt>Amount</dt><dd className="money">{money(lead.my_quote.amount)}</dd>
            <dt>Status</dt><dd>{lead.my_quote.status}{lead.my_quote.status === "accepted" ? " — you won this job 🎉" : ""}</dd>
            <dt>Inclusions</dt><dd>{lead.my_quote.inclusions}</dd>
          </dl>
        </div>
      ) : (
        <QuoteForm jobId={id} onDone={load} />
      )}

      {lead.my_quote && <Thread threadId={lead.my_quote.quote_id} />}
      {err && <p className="err">{err}</p>}
    </div>
  );
}

function QuoteForm({ jobId, onDone }: { jobId: string; onDone: () => void }) {
  const [amount, setAmount] = useState("180");
  const [inclusions, setInclusions] = useState("");
  const [avail, setAvail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    const dollars = Number(amount);
    if (!dollars || dollars <= 0) { setErr("Enter a valid quote amount."); return; }
    setBusy(true); setErr("");
    try {
      await api.submitQuote(jobId, {
        amount: Math.round(dollars * 100),
        inclusions: inclusions.trim() || "Fault-find and repair",
        earliest_availability: avail || undefined,
      });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h3>{Icon.pro}Submit a sealed quote</h3>
      <p className="notice" style={{ marginBottom: 14 }}>Your price is private — the homeowner sees it, no other tradie does.</p>
      <div className="grid two">
        <label className="field"><span className="lbl">Amount (AUD)</span>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="field"><span className="lbl">Earliest availability</span>
          <input type="date" value={avail} onChange={(e) => setAvail(e.target.value)} /></label>
      </div>
      <label className="field" style={{ marginBottom: 0 }}>
        <span className="lbl">What's included</span>
        <textarea value={inclusions} onChange={(e) => setInclusions(e.target.value)}
          placeholder="e.g. Fault-find and repair one power point, test and certify" style={{ minHeight: 70 }} />
      </label>
      {err && <p className="err">{err}</p>}
      <button className="btn" style={{ marginTop: 14 }} disabled={busy} onClick={submit}>{busy ? "Submitting…" : "Submit quote"}</button>
    </div>
  );
}
