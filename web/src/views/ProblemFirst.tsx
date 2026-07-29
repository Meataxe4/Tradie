import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useSession } from "../session";
import type { TriagePreview } from "../types";
import { CATEGORY_META, Icon } from "../ui";
import { HOW } from "./Login";
import { downscale } from "./NewJob";

/**
 * Variant B landing: the problem comes first, the account comes later.
 *
 * A guest types what's wrong and gets the triaged verdict immediately —
 * safety guidance is NEVER behind a signup wall, and an emergency takes over
 * the screen exactly as it does for a signed-in user. The signup only unlocks
 * the thing the verdict makes them want: the vetted tradie and the firm price.
 */

const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
const EXAMPLES = [
  "Water leaking under the kitchen sink",
  "A power point stopped working",
  "Hot water system is dead",
];
const POPULAR = ["electrical", "plumbing_water", "gas", "hvac", "carpentry", "handyman", "appliance", "locksmith"];

type Photo = { id: string; dataUrl: string; caption: string };

export function ProblemFirst() {
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<TriagePreview | null>(null);
  const [emergencyAck, setEmergencyAck] = useState(false);
  // DIY verdict: the customer can decline the self-help route and ask for a pro.
  const [wantPro, setWantPro] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    setErr("");
    const picked = Array.from(files).slice(0, Math.max(0, 3 - photos.length));
    try {
      const next: Photo[] = [];
      for (const f of picked) next.push({ id: `${Date.now()}-${next.length}`, dataUrl: await downscale(f), caption: "" });
      setPhotos((p) => [...p, ...next]);
    } catch (e) { setErr((e as Error).message); }
    if (galleryRef.current) galleryRef.current.value = "";
  };

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const res = await api.triagePreview({
        description: description.trim(),
        photos: photos.map((p) => p.dataUrl),
        captions: photos.map((p) => p.caption),
      });
      setPreview(res);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  // ---- emergency takeover: identical urgency to the signed-in flow ----
  if (preview && preview.triage.verdict === "EMERGENCY_STOP" && !emergencyAck) {
    const gas = preview.triage.category === "gas";
    return (
      <div className="emergency-takeover" role="alertdialog" aria-label="Emergency — act now">
        <div className="et-inner">
          <span className="et-icon" aria-hidden="true">⚠</span>
          <h1>Stop — act on this now</h1>
          <p className="et-msg">{preview.triage.user_message}</p>
          <div className="et-actions">
            {gas && (
              <a className="et-call" href="tel:1800427532">
                <b>Call the gas emergency line</b>
                <span>1800 GAS LEAK (1800 427 532)</span>
              </a>
            )}
            <a className="et-call" href="tel:000">
              <b>{gas ? "Fire, injury or immediate danger" : "Call Triple Zero"}</b>
              <span>000</span>
            </a>
          </div>
          <button className="et-continue" onClick={() => setEmergencyAck(true)}>
            I'm safe — show me the details
          </button>
        </div>
      </div>
    );
  }

  // ---- verdict + unlock screen ----
  if (preview) {
    const t = preview.triage;
    const diy = t.verdict === "DIY_SAFE";
    const trade = !t.recommended_trade || t.recommended_trade === "none" ? "tradie" : t.recommended_trade.replace("_", " ");
    return (
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <p className="eyebrow">We're onto it</p>
        <h1 className="page-title">{t.job_spec?.title ?? "Here's what this looks like"}</h1>
        <p className="page-sub">{t.user_message}</p>

        {preview.ballpark && (
          <div className="ballpark">
            <span className="bp-label">Typical range for this kind of job</span>
            <span className="bp-range">${Math.round(preview.ballpark.low / 100)} – ${Math.round(preview.ballpark.high / 100)}</span>
            <span className="bp-note">A guide only — your vetted {trade} sends one firm price, and payment's held until the job's done.</span>
          </div>
        )}

        {diy && t.diy_guidance && !wantPro && (
          <div className="card">
            <h3>{Icon.tools}You can sort this yourself — here's your guide</h3>
            <ol style={{ margin: "8px 0 0", paddingLeft: 20, lineHeight: 1.7 }}>
              {t.diy_guidance.steps.map((s) => <li key={s}>{s}</li>)}
            </ol>
            {t.diy_guidance.tools_required.length > 0 && (
              <p style={{ marginTop: 10, fontSize: 13.5, color: "var(--muted)" }}>
                <b>You'll need:</b> {t.diy_guidance.tools_required.join(", ")}
              </p>
            )}
            <p className="notice" style={{ marginTop: 10 }}>
              {t.diy_guidance.stop_conditions[0] ?? "If anything feels off, stop and get a licensed tradie."}
            </p>
            <button className="btn ghost" style={{ marginTop: 14, width: "100%" }} onClick={() => setWantPro(true)}>
              Thanks — but I'd rather a professional
            </button>
          </div>
        )}

        {(!diy || wantPro) && (
          <GuestSignup
            heading={`Your vetted local ${trade} is ready to quote`}
            sub={wantPro
              ? "No worries — plenty of people would rather a pro handle it. One firm, GST-inclusive price, payment held until it's done. Create your free account and we'll line them up."
              : "One firm, GST-inclusive price — no bidding wars, no call-backs. Create your free account and we'll get it to you now."}
            description={description}
            photos={photos}
            preferPro={wantPro}
            onErr={setErr}
          />
        )}
        {diy && !wantPro && (
          <GuestSignup
            heading="Want this saved, with a pro one tap away?"
            sub="Create a free account and we'll keep this job on file — if the fix goes sideways, a licensed pro is one tap away."
            description={description}
            photos={photos}
            preferPro={false}
            onErr={setErr}
          />
        )}

        {err && <p className="err">{err}</p>}
        <button className="btn ghost" style={{ marginTop: 14 }}
          onClick={() => { setPreview(null); setEmergencyAck(false); setWantPro(false); }}>
          ← Change my description
        </button>
        <p className="disclaimer" style={{ marginTop: 18 }}>{t.disclaimer}</p>
      </div>
    );
  }

  // ---- the intake: one screen, problem only ----
  const canSubmit = description.trim().length > 3;
  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <section className="hero" style={{ paddingBottom: 8 }}>
        <h1>What's gone wrong?<br /><span className="accent">Tell us — we're on it.</span></h1>
        <p className="sub">
          Describe it like you'd tell a mate. Our AI concierge works out what it is, whether it's safe,
          and what it should cost — <b>before</b> we ask you for anything else.
        </p>
      </section>

      <div className="card">
        <label className="field" style={{ marginBottom: 12 }}>
          <span className="lbl">Describe the problem</span>
          <textarea autoFocus value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Water leaking under the kitchen sink…" />
        </label>
        <div className="chips">
          {EXAMPLES.map((x) => <button className="chip" type="button" key={x} onClick={() => setDescription(x)}>{x}</button>)}
        </div>
        {photos.length > 0 && (
          <div className="photo-grid" style={{ marginTop: 12 }}>
            {photos.map((p) => (
              <div className="photo-item" key={p.id}>
                <div className="photo-thumb" style={{ backgroundImage: `url(${p.dataUrl})` }}>
                  <button type="button" className="photo-x" onClick={() => setPhotos((ph) => ph.filter((x) => x.id !== p.id))} aria-label="Remove photo">×</button>
                </div>
                <input className="photo-cap" value={p.caption}
                  onChange={(e) => setPhotos((ph) => ph.map((x) => x.id === p.id ? { ...x, caption: e.target.value } : x))}
                  placeholder="What does this show?" />
              </div>
            ))}
          </div>
        )}
        <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
          {photos.length < 3 && (
            <>
              <input ref={galleryRef} type="file" accept="image/*" multiple style={{ display: "none" }}
                onChange={(e) => addFiles(e.target.files)} />
              <button type="button" className="btn ghost sm" onClick={() => galleryRef.current?.click()}>
                <span style={{ width: 13, height: 13, display: "inline-flex", marginRight: 4 }}>{Icon.camera}</span> Add a photo
              </button>
            </>
          )}
        </div>
      </div>

      {err && <p className="err">{err}</p>}
      <button className="btn" style={{ width: "100%", fontSize: 17, padding: "14px 0" }}
        disabled={!canSubmit || busy} onClick={submit}>
        {busy ? "Working it out…" : "Sort it now →"}
      </button>
      <p style={{ fontSize: 12.5, color: "var(--muted)", textAlign: "center", marginTop: 10 }}>
        Free, instant, no account needed. If it's dangerous we'll tell you what to do first.
      </p>
      <p style={{ fontSize: 13, textAlign: "center", marginTop: 16 }}>
        Been here before? <Link to="/signin" style={{ color: "var(--accent)" }}>Sign in</Link>
      </p>

      <p className="section-h">How Sorted By works</p>
      <div className="how">
        {HOW.map((s) => (
          <div className="step" key={s.n}><div className="n">{s.n}</div><h4>{s.h}</h4><p>{s.p}</p></div>
        ))}
      </div>
      <div style={{ textAlign: "center", marginTop: 14 }}>
        <Link className="btn ghost sm" to="/how">See exactly how it works →</Link>
      </div>

      <p className="section-h">Popular categories</p>
      <div className="cats">
        {POPULAR.map((c) => {
          const meta = CATEGORY_META[c]!;
          return (
            <button className="cat-tile" key={c}
              onClick={() => { setDescription(`My ${meta.label.toLowerCase()} problem: `); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
              <span className="ci">{Icon[meta.icon]}</span>
              <span className="nm">{meta.label}</span>
            </button>
          );
        })}
      </div>

      <div className="card tradie-portal">
        <div className="tp-copy">
          <p className="eyebrow" style={{ margin: 0 }}>Tradie Portal</p>
          <h3 style={{ margin: "6px 0" }}>{Icon.tools}On the tools? Work's waiting.</h3>
          <p className="notice" style={{ margin: 0 }}>
            Jobs arrive fully specced — photos, scope, access notes. Your Copilot drafts the quote,
            the customer's money is held before you start, and you're paid on completion. 5% only when you're paid.
          </p>
        </div>
        <div className="tp-actions">
          <Link className="btn" to="/signin">Tradie sign in</Link>
          <Link className="btn ghost" to="/signin">Join as a tradie</Link>
        </div>
      </div>
    </div>
  );
}

/** Minimal homeowner signup that immediately posts the saved problem as a job. */
function GuestSignup({ heading, sub, description, photos, preferPro, onErr }: {
  heading: string; sub: string; description: string; photos: Photo[]; preferPro?: boolean; onErr: (m: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [suburb, setSuburb] = useState("");
  const [postcode, setPostcode] = useState("");
  const [state, setState] = useState("NSW");
  const [busy, setBusy] = useState(false);
  const { signIn } = useSession();
  const nav = useNavigate();

  const go = async () => {
    setBusy(true); onErr("");
    try {
      const auth = await api.register({ email, password, name, role: "homeowner", suburb, postcode, state });
      signIn(auth);
      const res = await api.createJob({
        description: description.trim(),
        photos: photos.map((p) => p.dataUrl),
        captions: photos.map((p) => p.caption),
        prefer_pro: preferPro,
        suburb, postcode, state,
      });
      nav(res.job.status === "DIY_RESOLVED" ? "/jobs" : `/jobs/${res.job.id}`);
    } catch (e) { onErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const ready = name && email && password.length >= 8 && suburb && postcode;
  return (
    <div className="card" style={{ borderColor: "var(--accent)" }}>
      <h3>{Icon.shield}{heading}</h3>
      <p className="notice" style={{ marginBottom: 14 }}>{sub}</p>
      <label className="field"><span className="lbl">Your name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
      <label className="field"><span className="lbl">Email</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      <label className="field"><span className="lbl">Password (min 8 characters)</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></label>
      <div className="row" style={{ gap: 10 }}>
        <label className="field" style={{ flex: 2 }}><span className="lbl">Suburb</span>
          <input value={suburb} onChange={(e) => setSuburb(e.target.value)} placeholder="Newtown" /></label>
        <label className="field" style={{ flex: 1 }}><span className="lbl">Postcode</span>
          <input value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="2042" inputMode="numeric" /></label>
        <label className="field" style={{ flex: 1 }}><span className="lbl">State</span>
          <select value={state} onChange={(e) => setState(e.target.value)}>
            {STATES.map((s) => <option key={s}>{s}</option>)}
          </select></label>
      </div>
      <button className="btn" style={{ width: "100%", marginTop: 14 }} disabled={!ready || busy} onClick={go}>
        {busy ? "Setting you up…" : "Get my firm quote →"}
      </button>
      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, textAlign: "center" }}>
        Free to join. Your problem is already saved — this just unlocks your quote.
      </p>
    </div>
  );
}
