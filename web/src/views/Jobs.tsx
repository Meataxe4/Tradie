import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { JobSummary, ProjectView } from "../types";
import { CATEGORY_META, Icon, Spinner, money, statusLabel } from "../ui";
import { timeAgo } from "../parts";

const VERDICT_LABEL: Record<string, { text: string; tone: string; bg: string }> = {
  DIY_SAFE: { text: "DIY — safe", tone: "var(--safe)", bg: "var(--safe-bg)" },
  NEEDS_LICENSED_PRO: { text: "Needs a pro", tone: "var(--pro)", bg: "var(--pro-bg)" },
  EMERGENCY_STOP: { text: "Emergency", tone: "var(--emergency)", bg: "var(--emergency-bg)" },
  UNCLEAR: { text: "Needs detail", tone: "var(--unclear)", bg: "var(--unclear-bg)" },
};

export function Jobs() {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [newProj, setNewProj] = useState("");
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");

  const load = () => {
    api.myJobs().then(setJobs).catch((e) => setErr(e.message));
    api.projects().then(setProjects).catch(() => {});
  };
  useEffect(load, []);

  const addProject = async () => {
    if (!newProj.trim()) return;
    setCreating(true);
    try { await api.createProject(newProj.trim()); setNewProj(""); load(); }
    catch (e) { setErr((e as Error).message); }
    finally { setCreating(false); }
  };

  if (err) return <p className="err">{err}</p>;
  if (!jobs) return <Spinner />;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <p className="eyebrow" style={{ marginBottom: 6 }}>Homeowner</p>
          <h1 className="page-title" style={{ margin: 0 }}>My jobs</h1>
        </div>
        <Link className="btn sm" to="/new">+ New job</Link>
      </div>

      {/* Concept-stage: customer projects — group jobs, indicative pricing, home logbook. */}
      <div className="proj-strip">
        {projects.map((pr) => (
          <Link className="proj-card" to={`/projects/${pr.id}`} key={pr.id}>
            <b>{pr.title}</b>
            <span>{pr.stages.length} job{pr.stages.length === 1 ? "" : "s"}{pr.firm_total > 0 ? ` · ${money(pr.firm_total)}${pr.all_priced ? "" : " so far"}` : ""}</span>
          </Link>
        ))}
        <div className="proj-new">
          <input value={newProj} onChange={(e) => setNewProj(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addProject(); }}
            placeholder='Start a project, e.g. "Fix the bathroom"' />
          <button className="btn ghost sm" disabled={creating} onClick={addProject}>{creating ? "…" : "Create"}</button>
        </div>
      </div>

      {jobs.length === 0 && (
        <div className="empty">No jobs yet. <Link to="/new">Describe a problem</Link> to get started.</div>
      )}

      <div className="list">
        {jobs.map((j) => {
          const meta = CATEGORY_META[j.category] ?? CATEGORY_META.other!;
          const v = j.verdict ? VERDICT_LABEL[j.verdict] : null;
          return (
            <Link className="feed-card" to={`/jobs/${j.id}`} key={j.id}>
              <div className="fc-top">
                <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
                  <span style={{ width: 40, height: 40, borderRadius: 11, display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)", flex: "none" }}>
                    {Icon[meta.icon]}
                  </span>
                  <div>
                    <h4>{j.category} · {j.suburb}</h4>
                    <div className="fc-meta">
                      <span className="m">{Icon.clock}posted {timeAgo(j.created_at)}</span>
                    </div>
                  </div>
                </div>
                {v && <span className="urgency-pill" style={{ color: v.tone, background: v.bg }}>{v.text}</span>}
              </div>
              <p className="desc" style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 13.5 }}>{j.description}</p>
              <div className="fc-foot">
                <span className="status">{statusLabel(j.status)}</span>
                {j.quote_count > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>
                    {j.quote_count} quote{j.quote_count === 1 ? "" : "s"} →
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
