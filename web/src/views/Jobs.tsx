import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { JobSummary } from "../types";
import { Spinner } from "../ui";

const VERDICT_TONE: Record<string, string> = {
  DIY_SAFE: "var(--safe)",
  NEEDS_LICENSED_PRO: "var(--pro)",
  EMERGENCY_STOP: "var(--emergency)",
  UNCLEAR: "var(--unclear)",
};

export function Jobs() {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.myJobs().then(setJobs).catch((e) => setErr(e.message));
  }, []);

  if (err) return <p className="err">{err}</p>;
  if (!jobs) return <Spinner />;

  return (
    <div>
      <p className="eyebrow">Homeowner</p>
      <h1 className="page-title">My jobs</h1>
      <p className="page-sub">Everything you've triaged. Open a posted job to see private quotes.</p>

      {jobs.length === 0 && (
        <div className="empty">
          No jobs yet. <Link to="/new">Describe a problem</Link> to get started.
        </div>
      )}

      <div className="list">
        {jobs.map((j) => (
          <Link className="tile" to={`/jobs/${j.id}`} key={j.id}>
            <div className="top">
              <h4>{j.category} · {j.suburb}</h4>
              <span className="status">{j.status}</span>
            </div>
            <p className="desc">{j.description}</p>
            <div className="tag-row" style={{ marginTop: 10 }}>
              {j.verdict && (
                <span className="tag" style={{ color: VERDICT_TONE[j.verdict] }}>{j.verdict}</span>
              )}
              {j.quote_count > 0 && <span className="tag">{j.quote_count} quote{j.quote_count > 1 ? "s" : ""}</span>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
