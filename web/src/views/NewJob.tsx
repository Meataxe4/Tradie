import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { CreateJobResponse } from "../types";
import { TriageView } from "./TriageView";

const EXAMPLES = [
  "A power point in the bedroom has stopped working",
  "There's a strong gas smell in the kitchen",
  "My kitchen cabinet door won't close properly",
  "The bathroom sink is draining really slowly",
  "Burning smell coming from the switchboard",
  "There's a burst pipe under the kitchen sink",
];

export function NewJob() {
  const [description, setDescription] = useState("");
  const [suburb, setSuburb] = useState("Newtown");
  const [postcode, setPostcode] = useState("2042");
  const [state, setState] = useState("NSW");
  const [address, setAddress] = useState("1 Example St, Newtown NSW 2042");
  const [photos, setPhotos] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<CreateJobResponse | null>(null);
  const nav = useNavigate();

  const submit = async () => {
    if (!description.trim()) { setErr("Please describe the problem first."); return; }
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

  if (result) {
    const posted = result.triage.verdict !== "DIY_SAFE";
    return (
      <div>
        <p className="eyebrow">Triage result</p>
        <h1 className="page-title">{result.job.category} · {result.job.suburb}</h1>
        <p className="page-sub">
          {posted
            ? `Posted to matched tradies — ${result.matched_tradies.length} notified. You'll see private quotes come in.`
            : "This one's a safe DIY job, so there's nothing to post."}
        </p>
        <TriageView triage={result.triage} overrides={result.overrides} modelVerdict={result.model_verdict} />
        <div className="row wrap" style={{ marginTop: 18 }}>
          {posted && (
            <button className="btn" onClick={() => nav(`/jobs/${result.job.id}`)}>View job & quotes →</button>
          )}
          <button className="btn ghost" onClick={() => { setResult(null); setDescription(""); }}>Post another problem</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="eyebrow">Homeowner</p>
      <h1 className="page-title">What's the problem?</h1>
      <p className="page-sub">
        Describe it the way you'd tell a friend. Our AI will work out whether it's a safe DIY fix or a job for a
        licensed tradesperson — and if it's the latter, write it up so tradies can quote accurately.
      </p>

      <div className="card">
        <label className="field">
          <span className="lbl">Describe the problem</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. One of the power points in the bedroom has stopped working…" />
        </label>
        <div className="chips" style={{ marginBottom: 4 }}>
          {EXAMPLES.map((x) => (
            <button className="chip" type="button" key={x} onClick={() => setDescription(x)}>{x}</button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="grid two">
          <label className="field"><span className="lbl">Suburb</span>
            <input value={suburb} onChange={(e) => setSuburb(e.target.value)} /></label>
          <label className="field"><span className="lbl">Postcode</span>
            <input value={postcode} onChange={(e) => setPostcode(e.target.value)} /></label>
          <label className="field"><span className="lbl">State</span>
            <select value={state} onChange={(e) => setState(e.target.value)}>
              {["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"].map((s) => <option key={s}>{s}</option>)}
            </select></label>
          <label className="field"><span className="lbl">Photos attached</span>
            <select value={photos} onChange={(e) => setPhotos(Number(e.target.value))}>
              {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
            </select></label>
        </div>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="lbl">Full address (revealed only to the tradie you book)</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
      </div>

      {err && <p className="err">{err}</p>}
      <button className="btn" onClick={submit} disabled={busy}>{busy ? "Triaging…" : "Get triage →"}</button>
    </div>
  );
}
