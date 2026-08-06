import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useSession } from "../session";
import type { AuthResult, Identity } from "../types";
import { Icon } from "../ui";
import { Avatar } from "../parts";
import { LoginForm, RegisterForm, Rotator, TRADIE_QUOTES } from "./Login";

/**
 * /tradies — the Tradie Portal. Everything on this page speaks to the trade:
 * the benefits are theirs (all the job info up front, quoting from the phone,
 * payment certainty), and the testimonials are tradie testimonials.
 */

const BENEFITS = [
  { icon: "doc" as const, h: "Every job arrives specced", p: "Photos, symptoms, access notes and the site-visit questions — all up front, before you commit to anything. No more 'how much to fix my thing?' calls." },
  { icon: "tools" as const, h: "Quote from the ute in minutes", p: "Your Copilot drafts the quote from the job spec and your rates. Check it, tweak it, send it — from your phone, no office software." },
  { icon: "shield" as const, h: "The money's real before you start", p: "Accepted means the customer's payment is already held. Finish the job, they confirm, you're paid — no invoicing, no chasing." },
  { icon: "clock" as const, h: "Know when you've been seen", p: "You'll see the moment the customer opens your quote — so you follow up at the right time, not into the void." },
  { icon: "pin" as const, h: "Jobs that fit you", p: "Matched on your trade, your licence and your service area. One vetted trade per job — no race to the bottom against six others." },
  { icon: "tick" as const, h: "8% only when you're paid — 5% for life if you're a founder", p: "No lead fees, no subscriptions, no paying for tyre-kickers. The platform only earns when you do — and foundation trades who join before launch keep a 5% rate locked for life." },
];

export function TradiePortal() {
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
  const tradieDemos = identities.filter((i) => i.role === "tradie");

  return (
    <div>
      <div style={{ textAlign: "right", marginBottom: 4 }}>
        <Link className="btn ghost sm" to="/">Home owner? Get your job sorted →</Link>
      </div>
      <section className="hero">
        <p className="eyebrow">Tradie Portal</p>
        <h1>Stop quoting blind.<br /><span className="accent">Start getting paid.</span></h1>
        <p className="sub">
          Sorted By sends you jobs with the homework already done — photos, scope and access notes
          before you leave the ute. You send one firm price, the customer's money is held before you
          start, and you're paid the day it's done.
        </p>

        <div className="authcard">
          <div className="tabs">
            <button className={tab === "register" ? "on" : ""} onClick={() => setTab("register")}>Join as a tradie</button>
            <button className={tab === "login" ? "on" : ""} onClick={() => setTab("login")}>Sign in</button>
          </div>
          {tab === "register" ? <RegisterForm onDone={go} defaultRole="tradie" lockRole /> : <LoginForm onDone={go} />}
        </div>

        {tradieDemos.length > 0 && (
          <div className="demo-block">
            <div className="demo-lbl">or try the tradie side instantly</div>
            <div className="demo-row">
              {tradieDemos.map((i) => (
                <button className="demo-btn" key={i.id} onClick={() => api.demoLogin(i.id).then(go).catch(() => {})}>
                  <Avatar name={i.label} size={22} />{i.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <p className="section-h">Why tradies use Sorted By</p>
      <div className="how">
        {BENEFITS.map((b) => (
          <div className="step" key={b.h}>
            <div className="n" style={{ display: "grid", placeItems: "center" }}>
              <span style={{ width: 15, height: 15, display: "inline-flex" }}>{Icon[b.icon]}</span>
            </div>
            <h4>{b.h}</h4>
            <p>{b.p}</p>
          </div>
        ))}
      </div>

      <Rotator quotes={TRADIE_QUOTES} />
    </div>
  );
}
