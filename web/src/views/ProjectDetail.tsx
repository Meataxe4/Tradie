import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import type { ProjectView } from "../types";
import { CATEGORY_META, Icon, Spinner, money, statusLabel } from "../ui";

/**
 * Concept-stage: the customer's one-flow view of a project — sequenced stages,
 * per-stage prices (firm quote or clearly-indicative range), one running total,
 * and the growing home-logbook of completed, certified work.
 */
export function ProjectDetail() {
  const { id = "" } = useParams();
  const [project, setProject] = useState<ProjectView | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    api.project(id).then(setProject).catch((e) => setErr(e.message));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (err && !project) return <p className="err">{err}</p>;
  if (!project) return <Spinner />;

  const done = project.stages.filter((s) => s.status === "COMPLETED" || s.status === "REVIEWED");

  return (
    <div>
      <p className="eyebrow">{project.kind === "multi_trade" ? "Multi-trade project" : "Your project"}</p>
      <h1 className="page-title">{project.title}</h1>
      <p className="page-sub">
        {project.kind === "multi_trade"
          ? "One problem, several trades — we've split it into stages in the right order. Book each stage when you're ready; one place, one payment relationship."
          : "Group the jobs, see indicative prices before you commit, and build a record of the finished work."}
      </p>

      <div className="proj-total">
        <div>
          <span className="e-label">{project.all_priced ? "Firm total (GST incl.)" : "Priced so far (GST incl.)"}</span>
          <span className="e-amt">{money(project.firm_total)}</span>
        </div>
        <span className="proj-note">
          {project.all_priced
            ? "Every stage has a firm price — no surprises."
            : "Stages without a firm quote yet show an indicative range."}
        </span>
      </div>

      <div className="list">
        {project.stages.map((s) => {
          const meta = CATEGORY_META[s.category] ?? CATEGORY_META.other!;
          const finished = s.status === "COMPLETED" || s.status === "REVIEWED";
          return (
            <Link className="feed-card" to={`/jobs/${s.job_id}`} key={s.job_id}>
              <div className="fc-top">
                <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
                  <span className="stage-n">{finished ? Icon.tick : s.stage_index}</span>
                  <div>
                    <h4>Stage {s.stage_index} · {s.stage_label}</h4>
                    <div className="fc-meta">
                      <span className="m">{Icon[meta.icon]}{meta.label}</span>
                      <span className="m">{statusLabel(s.status)}</span>
                    </div>
                  </div>
                </div>
                <span className="stage-price">
                  {s.quote_amount !== null
                    ? <b>{money(s.quote_amount)}</b>
                    : s.ballpark
                      ? <em>~{money(s.ballpark.low)}–{money(s.ballpark.high)}</em>
                      : <em>pricing…</em>}
                </span>
              </div>
              {s.certificate ? (
                <span className="cert-chip ok">{Icon.shield}{s.certificate.name} · ref {s.certificate.reference}</span>
              ) : finished && s.certificate_required ? (
                <span className="cert-chip pending">{Icon.shield}{s.certificate_required} — pending from your tradie</span>
              ) : null}
            </Link>
          );
        })}
      </div>

      {done.length > 0 && (
        <p className="notice" style={{ marginTop: 16 }}>
          <b>{done.length} of {project.stages.length}</b> stages complete. Finished, certified work stays here as
          your home logbook — handy at sale time and for insurance.
        </p>
      )}

      <div className="row wrap" style={{ marginTop: 18 }}>
        <Link className="btn ghost" to={`/new?project=${project.id}`}>+ Add another job to this project</Link>
      </div>
    </div>
  );
}
