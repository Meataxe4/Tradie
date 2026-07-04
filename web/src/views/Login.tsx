import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useSession } from "../session";
import type { Identity } from "../types";
import { CATEGORY_META, Icon } from "../ui";

const HOW = [
  { n: 1, h: "Describe the problem", p: "Tell us what's wrong in plain words and add a photo. Our AI works out what's going on." },
  { n: 2, h: "Get it triaged safely", p: "Safe DIY jobs get step-by-step guidance. Anything regulated is written up for licensed tradies." },
  { n: 3, h: "Choose from private quotes", p: "Verified tradies send sealed quotes only you can see. Compare, chat, and book the one you like." },
];

const POPULAR = ["electrical", "plumbing_water", "gas", "hvac", "carpentry", "handyman", "appliance", "locksmith"];

const EXAMPLES = [
  "A power point in the bedroom stopped working",
  "The bathroom sink is draining slowly",
  "My kitchen cabinet door won't close",
];

export function Login() {
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");
  const { signIn } = useSession();
  const nav = useNavigate();

  useEffect(() => {
    api.identities().then(setIdentities).catch((e) => setErr(String(e.message ?? e)));
  }, []);

  const asHomeowner = identities.find((i) => i.role === "homeowner");
  const asTradie = identities.find((i) => i.role === "tradie");

  const post = () => {
    if (!asHomeowner) return;
    if (draft.trim()) sessionStorage.setItem("squiz.draft", draft.trim());
    signIn(asHomeowner);
    nav("/new");
  };

  return (
    <div>
      <section className="hero">
        <h1>Home repair, <span className="accent">triaged by AI</span>,<br />quoted by verified tradies</h1>
        <p className="sub">
          Describe a problem and we'll tell you if it's a safe DIY fix — or connect you with licensed,
          verified tradies who send private quotes. Australia-wide.
        </p>

        <div className="hero-card">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What needs doing? e.g. One of the power points in the bedroom has stopped working…"
          />
          <div className="go-row">
            <button className="btn" onClick={post} disabled={!asHomeowner}>
              Get started <span style={{ display: "inline-flex", width: 16, height: 16, verticalAlign: "-3px", marginLeft: 4 }}>{Icon.arrow}</span>
            </button>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Free · no obligation</span>
          </div>
          <div className="chips" style={{ marginTop: 12 }}>
            {EXAMPLES.map((x) => (
              <button className="chip" key={x} onClick={() => setDraft(x)}>{x}</button>
            ))}
          </div>
        </div>

        <p className="hero-alt">
          Are you a tradesperson?{" "}
          <button onClick={() => { if (asTradie) { signIn(asTradie); nav("/leads"); } }}>Browse jobs near you →</button>
        </p>
        {err && <p className="err" style={{ textAlign: "center" }}>{err}</p>}
      </section>

      <p className="section-h">How Squiz works</p>
      <div className="how">
        {HOW.map((s) => (
          <div className="step" key={s.n}>
            <div className="n">{s.n}</div>
            <h4>{s.h}</h4>
            <p>{s.p}</p>
          </div>
        ))}
      </div>

      <p className="section-h">Popular categories</p>
      <div className="cats">
        {POPULAR.map((c) => {
          const meta = CATEGORY_META[c]!;
          return (
            <button className="cat-tile" key={c} onClick={post}>
              <span className="ci">{Icon[meta.icon]}</span>
              <span className="nm">{meta.label}</span>
            </button>
          );
        })}
      </div>

      <p style={{ textAlign: "center", color: "var(--faint)", fontSize: 12.5, marginTop: 40 }}>
        Demo preview · sign-in is simulated. Posting signs you in as a sample homeowner.
      </p>
    </div>
  );
}
