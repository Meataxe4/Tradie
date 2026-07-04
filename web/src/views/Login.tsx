import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useSession } from "../session";
import type { Identity } from "../types";
import { Spinner } from "../ui";

const AVATAR: Record<string, { bg: string; fg: string }> = {
  homeowner: { bg: "var(--pro-bg)", fg: "var(--pro)" },
  tradie: { bg: "var(--safe-bg)", fg: "var(--safe)" },
  admin: { bg: "var(--surface-2)", fg: "var(--muted)" },
};

export function Login() {
  const [identities, setIdentities] = useState<Identity[] | null>(null);
  const [err, setErr] = useState("");
  const { signIn } = useSession();
  const nav = useNavigate();

  useEffect(() => {
    api.identities().then(setIdentities).catch((e) => setErr(String(e.message ?? e)));
  }, []);

  const choose = (id: Identity) => {
    signIn(id);
    nav(id.role === "tradie" ? "/leads" : "/new");
  };

  return (
    <div className="login-wrap">
      <p className="eyebrow">Demo sign-in</p>
      <h1 className="page-title">Who are you today?</h1>
      <p className="page-sub">
        Real auth is deferred to v1 — for this preview, pick a seeded identity. Homeowners post jobs and get
        private quotes; tradies see matched leads and quote on them.
      </p>
      {err && <p className="err">{err}</p>}
      {!identities && !err && <Spinner />}
      {identities?.filter((i) => i.role !== "admin").map((i) => {
        const a = AVATAR[i.role] ?? AVATAR.admin;
        return (
          <button className="identity-btn" key={i.id} onClick={() => choose(i)}>
            <span className="av" style={{ background: a.bg, color: a.fg }}>
              {i.label.charAt(0).toUpperCase()}
            </span>
            <span>
              <span className="nm">{i.label}</span>
              <span className="rl">{i.role}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
