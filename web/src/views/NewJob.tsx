import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { CreateJobResponse } from "../types";
import { Icon } from "../ui";
import { TriageView } from "./TriageView";

const EXAMPLES = [
  "A power point in the bedroom has stopped working",
  "There's a strong gas smell in the kitchen",
  "My kitchen cabinet door won't close properly",
  "The bathroom sink is draining really slowly",
  "Burning smell coming from the switchboard",
  "There's a burst pipe under the kitchen sink",
];

const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];

export function NewJob() {
  const [step, setStep] = useState(0);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState(1);
  const [suburb, setSuburb] = useState("Newtown");
  const [postcode, setPostcode] = useState("2042");
  const [state, setState] = useState("NSW");
  const [address, setAddress] = useState("1 Example St, Newtown NSW 2042");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<CreateJobResponse | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    const draft = sessionStorage.getItem("squiz.draft");
    if (draft) { setDescription(draft); sessionStorage.removeItem("squiz.draft"); }
  }, []);

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const res = await api.createJob({
        description: description.trim(),
        photos: Array.from({ length: photos }, (_, i) => `photo-${i + 1}`),
        suburb, postcode, state, full_address: address,
      });
      setResult(res);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // ---- result screen ----
  if (result) {
    const posted = result.triage.verdict !== "DIY_SAFE";
    return (
      <div>
        <p className="eyebrow">Your triage result</p>
        <h1 className="page-title">{result.triage.job_spec?.title ?? `${result.job.category} · ${result.job.suburb}`}</h1>
        <p className="page-sub">
          {posted
            ? `We've matched and notified ${result.matched_tradies.length} verified ${result.triage.recommended_trade.replace("_", " ")}${result.matched_tradies.length === 1 ? "" : "s"}. Private quotes will appear on your job.`
            : "Good news — this is a safe DIY job, so there's nothing to book."}
        </p>
        <TriageView triage={result.triage} overrides={result.overrides} modelVerdict={result.model_verdict} />
        <div className="row wrap" style={{ marginTop: 18 }}>
          {posted && <button className="btn" onClick={() => nav(`/jobs/${result.job.id}`)}>View job & quotes →</button>}
          <button className="btn ghost" onClick={() => { setResult(null); setDescription(""); setStep(0); }}>Post another problem</button>
        </div>
      </div>
    );
  }

  // ---- wizard ----
  const canNext = description.trim().length > 3;
  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div className="wizard-nav">
        <div className={`wstep ${step === 0 ? "active" : "done"}`}><span className="wn">{step > 0 ? "✓" : "1"}</span> The problem</div>
        <div className="wsep" />
        <div className={`wstep ${step === 1 ? "active" : ""}`}><span className="wn">2</span> Location</div>
      </div>

      {step === 0 && (
        <div>
          <h1 className="page-title">What's the problem?</h1>
          <p className="page-sub">Describe it like you'd tell a mate. Add a photo if you can — it helps tradies quote accurately.</p>
          <div className="card">
            <label className="field" style={{ marginBottom: 12 }}>
              <span className="lbl">Describe the problem</span>
              <textarea autoFocus value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. One of the power points in the bedroom has stopped working…" />
            </label>
            <div className="chips">
              {EXAMPLES.map((x) => <button className="chip" type="button" key={x} onClick={() => setDescription(x)}>{x}</button>)}
            </div>
          </div>
          <div className="card">
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="lbl" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 13, height: 13, display: "inline-flex" }}>{Icon.camera}</span> Photos attached
              </span>
              <select value={photos} onChange={(e) => setPhotos(Number(e.target.value))}>
                {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n} photo{n === 1 ? "" : "s"}</option>)}
              </select>
            </label>
          </div>
          <button className="btn" disabled={!canNext} onClick={() => setStep(1)}>Continue →</button>
        </div>
      )}

      {step === 1 && (
        <div>
          <h1 className="page-title">Where's the job?</h1>
          <p className="page-sub">We only show tradies your suburb until you book. Your full address is revealed to the tradie you choose — nobody else.</p>
          <div className="card">
            <div className="grid two">
              <label className="field"><span className="lbl">Suburb</span>
                <input value={suburb} onChange={(e) => setSuburb(e.target.value)} /></label>
              <label className="field"><span className="lbl">Postcode</span>
                <input value={postcode} onChange={(e) => setPostcode(e.target.value)} /></label>
              <label className="field" style={{ marginBottom: 0 }}><span className="lbl">State</span>
                <select value={state} onChange={(e) => setState(e.target.value)}>
                  {STATES.map((s) => <option key={s}>{s}</option>)}
                </select></label>
            </div>
          </div>
          <div className="card">
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="lbl" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 13, height: 13, display: "inline-flex" }}>{Icon.pin}</span> Full address (private until you book)
              </span>
              <input value={address} onChange={(e) => setAddress(e.target.value)} />
            </label>
          </div>
          {err && <p className="err">{err}</p>}
          <div className="row wrap">
            <button className="btn ghost" onClick={() => setStep(0)}>← Back</button>
            <button className="btn" onClick={submit} disabled={busy}>{busy ? "Getting your result…" : "Get triage & quotes →"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
