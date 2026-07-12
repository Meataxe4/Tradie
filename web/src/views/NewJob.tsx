import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { CreateJobResponse } from "../types";
import { Icon, money } from "../ui";
import { TriageView } from "./TriageView";
import { storage } from "../storage";

const EXAMPLES = [
  "A power point in the bedroom has stopped working",
  "There's a strong gas smell in the kitchen",
  "My kitchen cabinet door won't close properly",
  "The bathroom sink is draining really slowly",
  "Burning smell coming from the switchboard",
  "There's a burst pipe under the kitchen sink",
];

const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];

interface Photo { id: string; dataUrl: string; caption: string; }

/** Downscale a picked image to keep the payload small (max 1000px, JPEG q0.6). */
function downscale(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not load that image"));
      img.onload = () => {
        const max = 1000;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas unavailable"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function NewJob() {
  const [step, setStep] = useState(0);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [suburb, setSuburb] = useState("Newtown");
  const [postcode, setPostcode] = useState("2042");
  const [state, setState] = useState("NSW");
  const [address, setAddress] = useState("1 Example St, Newtown NSW 2042");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<CreateJobResponse | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    const draft = storage.get("squiz.draft");
    if (draft) { setDescription(draft); storage.remove("squiz.draft"); }
  }, []);

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    setErr("");
    const room = 3 - photos.length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    try {
      const next: Photo[] = [];
      for (const f of picked) {
        const dataUrl = await downscale(f);
        next.push({ id: `${Date.now()}-${next.length}`, dataUrl, caption: "" });
      }
      setPhotos((p) => [...p, ...next]);
    } catch (e) {
      setErr((e as Error).message);
    }
    if (fileRef.current) fileRef.current.value = "";
  };
  const setCaption = (id: string, caption: string) =>
    setPhotos((p) => p.map((x) => (x.id === id ? { ...x, caption } : x)));
  const removePhoto = (id: string) => setPhotos((p) => p.filter((x) => x.id !== id));

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const res = await api.createJob({
        description: description.trim(),
        photos: photos.map((p) => p.dataUrl),
        captions: photos.map((p) => p.caption),
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
    const isPro = result.triage.verdict !== "DIY_SAFE";
    const trade = result.triage.recommended_trade.replace("_", " ");
    const sub = !isPro
      ? "Good news — this is a safe DIY job, so there's nothing to book."
      : result.quote
        ? `We've assigned ${result.assigned_tradie?.business_name ?? `a vetted ${trade}`} and prepared a firm price from our price book. Review and accept in a tap.`
        : result.assigned_tradie
          ? `We've assigned ${result.assigned_tradie.business_name} — they'll send you a firm quote shortly, with all the detail you gave us.`
          : `We'll assign a vetted local ${trade} and get you a firm quote shortly.`;
    return (
      <div>
        <p className="eyebrow">Your concierge result</p>
        <h1 className="page-title">{result.triage.job_spec?.title ?? `${result.job.category} · ${result.job.suburb}`}</h1>
        <p className="page-sub">{sub}</p>

        {result.vision.mode !== "none" && (
          <div className="vision-badge">
            <span className="vb-ico">{Icon.camera}</span>
            <div>
              <b>{result.vision.photos} photo{result.vision.photos === 1 ? "" : "s"} {result.vision.mode === "live" ? "reviewed by our AI" : "attached"}</b>
              <span>
                {result.vision.mode === "live"
                  ? "Our AI looked at your photos to help spot hazards — a photo can never make a job look safer than it is."
                  : `In this preview, triage reads your description${result.vision.captions ? " and photo notes" : ""}; live, our AI also analyses the photos themselves.`}
              </span>
            </div>
          </div>
        )}

        {result.ballpark && (
          <div className="ballpark">
            <span className="bp-label">Typical range for this kind of job</span>
            <span className="bp-range">{money(result.ballpark.low)} – {money(result.ballpark.high)}</span>
            <span className="bp-note">A guide only — your assigned trade sends one firm price, and payment's held until the job's done.</span>
          </div>
        )}

        <TriageView triage={result.triage} overrides={result.overrides} modelVerdict={result.model_verdict} />
        <div className="row wrap" style={{ marginTop: 18 }}>
          {isPro && <button className="btn" onClick={() => nav(`/jobs/${result.job.id}`)}>{result.quote ? "View your quote →" : "View job →"}</button>}
          <button className="btn ghost" onClick={() => { setResult(null); setDescription(""); setPhotos([]); setStep(0); }}>Post another problem</button>
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
          <p className="page-sub">Describe it like you'd tell a mate. Add a photo if you can — our AI reviews it to route the job safely.</p>
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
            <span className="lbl" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <span style={{ width: 13, height: 13, display: "inline-flex" }}>{Icon.camera}</span> Photos (optional, up to 3)
            </span>
            {photos.length > 0 && (
              <div className="photo-grid">
                {photos.map((p) => (
                  <div className="photo-item" key={p.id}>
                    <div className="photo-thumb" style={{ backgroundImage: `url(${p.dataUrl})` }}>
                      <button type="button" className="photo-x" onClick={() => removePhoto(p.id)} aria-label="Remove photo">×</button>
                    </div>
                    <input className="photo-cap" value={p.caption} onChange={(e) => setCaption(p.id, e.target.value)}
                      placeholder="What does this show?" />
                  </div>
                ))}
              </div>
            )}
            {photos.length < 3 && (
              <>
                <input ref={fileRef} type="file" accept="image/*" multiple capture="environment"
                  style={{ display: "none" }} onChange={(e) => addFiles(e.target.files)} />
                <button type="button" className="btn ghost sm" onClick={() => fileRef.current?.click()}>
                  <span style={{ width: 13, height: 13, display: "inline-flex", marginRight: 4 }}>{Icon.camera}</span> Add photo
                </button>
              </>
            )}
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 0" }}>
              A quick note on each photo helps us route it right — and our AI reads the image itself to spot hazards.
            </p>
          </div>
          {err && <p className="err">{err}</p>}
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
