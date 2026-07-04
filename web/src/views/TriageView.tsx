import type { Override, TriageResult, Verdict } from "../types";
import { GatePanel, Icon, VerdictBanner, tradeName } from "../ui";

/** Renders the full homeowner-facing triage: banner, body, optional gate, disclaimer. */
export function TriageView({ triage, overrides, modelVerdict }: {
  triage: TriageResult;
  overrides?: Override[];
  modelVerdict?: Verdict;
}) {
  const t = triage;
  return (
    <div className="stack">
      <VerdictBanner t={t} />

      {t.verdict === "DIY_SAFE" && t.diy_guidance && (
        <>
          <div className="card">
            <h3>{Icon.tools}Do-it-yourself steps</h3>
            <ol className="steps">
              {t.diy_guidance.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>
          {t.diy_guidance.tools_required.length > 0 && (
            <div className="card">
              <h3>{Icon.doc}Tools you'll need</h3>
              <div className="tools">
                {t.diy_guidance.tools_required.map((x) => <span key={x}>{x}</span>)}
              </div>
            </div>
          )}
          <div className="card">
            <h3>{Icon.stopSmall}When to stop and call a pro</h3>
            <ul className="stops">
              {t.diy_guidance.stop_conditions.map((s, i) => (
                <li key={i}>{Icon.stopSmall}<span>{s}</span></li>
              ))}
            </ul>
          </div>
        </>
      )}

      {t.verdict === "UNCLEAR" && t.clarifying_questions.length > 0 && (
        <div className="card">
          <h3>{Icon.quest}A few quick questions</h3>
          <ul className="stops">
            {t.clarifying_questions.map((q, i) => <li key={i}><span>{q}</span></li>)}
          </ul>
        </div>
      )}

      {(t.verdict === "NEEDS_LICENSED_PRO" || t.verdict === "EMERGENCY_STOP") && t.job_spec && (
        <div className="card">
          <h3>{Icon.doc}Job spec for tradies</h3>
          <dl className="spec">
            <dt>Title</dt><dd>{t.job_spec.title}</dd>
            <dt>Trade</dt><dd>{tradeName(t.recommended_trade)}</dd>
            {t.required_licence_class && (<><dt>Licence</dt><dd>{t.required_licence_class}</dd></>)}
            <dt>Urgency</dt><dd>{t.job_spec.urgency}</dd>
            {t.job_spec.symptoms.length > 0 && (
              <><dt>Symptoms</dt><dd><ul>{t.job_spec.symptoms.map((s, i) => <li key={i}>{s}</li>)}</ul></dd></>
            )}
            {t.job_spec.questions_for_site_visit.length > 0 && (
              <><dt>On-site checks</dt><dd><ul>{t.job_spec.questions_for_site_visit.map((q, i) => <li key={i}>{q}</li>)}</ul></dd></>
            )}
            {t.why_pro_needed && (<><dt>Why a pro</dt><dd>{t.why_pro_needed}</dd></>)}
          </dl>
        </div>
      )}

      {overrides && modelVerdict && (
        <GatePanel overrides={overrides} modelVerdict={modelVerdict} finalVerdict={t.verdict} />
      )}

      <p className="disclaimer">{t.disclaimer}</p>
    </div>
  );
}
