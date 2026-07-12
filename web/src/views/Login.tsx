import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useSession } from "../session";
import type { AuthResult, Identity, RegisterInput } from "../types";
import { CATEGORY_META, Icon } from "../ui";
import { Avatar } from "../parts";

const HOW = [
  { n: 1, h: "Tell the concierge", p: "Describe the problem in plain words and add photos. Our AI concierge asks the right questions — the way a great tradie would on the phone." },
  { n: 2, h: "Get one firm quote", p: "A genuinely safe fix is walked through step by step. Otherwise you get one firm, GST-inclusive price from a vetted local trade — no bidding wars, no chasing quotes." },
  { n: 3, h: "Accept in a tap, pay when it's done", p: "Booking holds your payment securely. The trade arrives knowing the scope, and money is only charged once the job's complete." },
];
const TRUST = [
  "Vetted, licensed & insured trades",
  "Firm upfront prices",
  "Payment held until the job's done",
  "5% fee — only on completed jobs",
];
const POPULAR = ["electrical", "plumbing_water", "gas", "hvac", "carpentry", "handyman", "appliance", "locksmith"];
const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
const TRADES = ["electrical", "plumbing_water", "gas", "hvac", "carpentry", "handyman", "appliance", "locksmith"];

export function Login() {
  const [tab, setTab] = useState<"register" | "login">("register");
  const [identities, setIdentities] = useState<Identity[]>([]);
  const { signIn } = useSession();
  const nav = useNavigate();

  useEffect(() => {
    api.identities().then(setIdentities).catch(() => {});
  }, []);

  const go = (result: AuthResult) => {
    signIn(result);
    nav(result.user.role === "tradie" ? "/leads" : result.user.role === "admin" ? "/admin" : "/new");
  };

  return (
    <div>
      <section className="hero">
        <h1>A great tradie at a fair price,<br /><span className="accent">sorted</span>.</h1>
        <p className="sub">
          Tell our AI concierge what's wrong. Get safe DIY help, or one firm quote from a vetted local
          trade — accept in a tap, with your payment held securely until the job's done.
        </p>

        <div className="trust-strip">
          {TRUST.map((t) => (
            <span className="trust-pill" key={t}><span className="tick" aria-hidden="true">{Icon.tick}</span>{t}</span>
          ))}
        </div>

        <div className="authcard">
          <div className="tabs">
            <button className={tab === "register" ? "on" : ""} onClick={() => setTab("register")}>Create account</button>
            <button className={tab === "login" ? "on" : ""} onClick={() => setTab("login")}>Sign in</button>
          </div>
          {tab === "register" ? <RegisterForm onDone={go} /> : <LoginForm onDone={go} />}
        </div>

        {identities.length > 0 && (
          <div className="demo-block">
            <div className="demo-lbl">or try instantly with a demo account</div>
            <div className="demo-row">
              {identities.map((i) => (
                <button className="demo-btn" key={i.id} onClick={() => api.demoLogin(i.id).then(go).catch(() => {})}>
                  <Avatar name={i.label} size={22} />{i.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <p className="section-h">How Sorted By works</p>
      <div className="how">
        {HOW.map((s) => (
          <div className="step" key={s.n}><div className="n">{s.n}</div><h4>{s.h}</h4><p>{s.p}</p></div>
        ))}
      </div>

      <p className="section-h">Popular categories</p>
      <div className="cats">
        {POPULAR.map((c) => {
          const meta = CATEGORY_META[c]!;
          return (
            <button className="cat-tile" key={c} onClick={() => setTab("register")}>
              <span className="ci">{Icon[meta.icon]}</span>
              <span className="nm">{meta.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LoginForm({ onDone }: { onDone: (r: AuthResult) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async () => {
    setBusy(true); setErr("");
    try { onDone(await api.login(email, password)); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <label className="field"><span className="lbl">Email</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      <label className="field"><span className="lbl">Password</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
      {err && <p className="err">{err}</p>}
      <button className="btn" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}

function RegisterForm({ onDone }: { onDone: (r: AuthResult) => void }) {
  const [role, setRole] = useState<"homeowner" | "tradie">("homeowner");
  const [f, setF] = useState<RegisterInput>({ email: "", password: "", name: "", role: "homeowner", state: "NSW" });
  const [postcodesStr, setPostcodesStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof RegisterInput, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const payload: RegisterInput = {
        ...f, role,
        trades: role === "tradie" && f.trades?.length ? f.trades : undefined,
        service_postcodes: role === "tradie"
          ? postcodesStr.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
      };
      onDone(await api.register(payload));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="seg">
        <button type="button" className={role === "homeowner" ? "on" : ""} onClick={() => setRole("homeowner")}>I need a job done</button>
        <button type="button" className={role === "tradie" ? "on" : ""} onClick={() => setRole("tradie")}>I'm a tradie</button>
      </div>

      <label className="field"><span className="lbl">Your name</span>
        <input value={f.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" /></label>
      <label className="field"><span className="lbl">Email</span>
        <input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" /></label>
      <label className="field"><span className="lbl">Password (min 8 characters)</span>
        <input type="password" value={f.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" /></label>

      {role === "homeowner" ? (
        <div className="grid two">
          <label className="field"><span className="lbl">Suburb</span>
            <input value={f.suburb ?? ""} onChange={(e) => set("suburb", e.target.value)} /></label>
          <label className="field"><span className="lbl">Postcode</span>
            <input value={f.postcode ?? ""} onChange={(e) => set("postcode", e.target.value)} /></label>
        </div>
      ) : (
        <>
          <label className="field"><span className="lbl">Business name</span>
            <input value={f.business_name ?? ""} onChange={(e) => set("business_name", e.target.value)} /></label>
          <div className="grid two">
            <label className="field"><span className="lbl">ABN</span>
              <input value={f.abn ?? ""} onChange={(e) => set("abn", e.target.value)} /></label>
            <label className="field"><span className="lbl">State</span>
              <select value={f.state ?? "NSW"} onChange={(e) => set("state", e.target.value)}>
                {STATES.map((s) => <option key={s}>{s}</option>)}
              </select></label>
            <label className="field"><span className="lbl">Primary trade</span>
              <select value={f.trades?.[0] ?? ""} onChange={(e) => setF((p) => ({ ...p, trades: [e.target.value] }))}>
                <option value="">Select…</option>
                {TRADES.map((t) => <option key={t} value={t}>{CATEGORY_META[t]?.label ?? t}</option>)}
              </select></label>
            <label className="field"><span className="lbl">Service postcodes</span>
              <input placeholder="2042, 2040" value={postcodesStr} onChange={(e) => setPostcodesStr(e.target.value)} /></label>
          </div>
          <label className="field"><span className="lbl">Licence class</span>
            <input placeholder="e.g. Unrestricted electrical licence" value={f.licence_class ?? ""} onChange={(e) => set("licence_class", e.target.value)} /></label>
          <p className="notice" style={{ marginBottom: 12 }}>New tradie accounts are verified by our team before you can quote (§10). You'll get access once your licence checks out.</p>
        </>
      )}

      {err && <p className="err">{err}</p>}
      <button className="btn" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
    </form>
  );
}
