import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../ui";

/**
 * /how — the visual explainer. The landing page stays clean and points here;
 * this page shows the product doing the work, one phone frame per step,
 * written to pass the 70-year-old test: plain words, one idea per screen.
 */

type Audience = "homeowner" | "tradie";

export function HowItWorks() {
  const [aud, setAud] = useState<Audience>("homeowner");
  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <p className="eyebrow">How it works</p>
      <h1 className="page-title">Three steps. No chasing. No surprises.</h1>
      <p className="page-sub">
        {aud === "homeowner"
          ? "From \"something's wrong\" to \"it's fixed and paid for\" — here's exactly what happens."
          : "From \"job posted\" to \"money in your account\" — here's exactly what happens."}
      </p>

      <div className="tabs" style={{ maxWidth: 380, margin: "0 auto 26px" }}>
        <button className={aud === "homeowner" ? "on" : ""} onClick={() => setAud("homeowner")}>For homeowners</button>
        <button className={aud === "tradie" ? "on" : ""} onClick={() => setAud("tradie")}>For tradies</button>
      </div>

      {aud === "homeowner" ? <HomeownerSteps /> : <TradieSteps />}

      <div className="card safety-strip">
        <h3>{Icon.shield}Safety comes before speed — always</h3>
        <p className="notice">
          If what you describe sounds dangerous — a gas smell, sparks, water near power — the concierge
          stops everything, tells you what to do right now, and gets the right licensed professional
          moving. We will never walk you through work that legally needs a licence.
        </p>
      </div>

      <div style={{ textAlign: "center", margin: "30px 0 10px" }}>
        <Link className="btn" to="/">Get sorted →</Link>
      </div>
    </div>
  );
}

function Step({ n, h, p, children }: { n: number; h: string; p: string; children: ReactNode }) {
  return (
    <div className="hiw-step">
      <div className="hiw-copy">
        <div className="n">{n}</div>
        <h3>{h}</h3>
        <p>{p}</p>
      </div>
      <div className="phone" aria-hidden="true">
        <div className="phone-notch" />
        <div className="phone-screen">{children}</div>
      </div>
    </div>
  );
}

function HomeownerSteps() {
  return (
    <div className="hiw">
      <Step n={1} h="Say what's wrong — like you'd tell a mate"
        p="Type it or snap a photo. Our concierge asks the right follow-up questions, the way a good tradie would on the phone. If it's genuinely safe to fix yourself, we walk you through it — free.">
        <div className="mini-card">
          <div className="mini-lbl">What's the problem?</div>
          <div className="mini-input">Water leaking under the kitchen sink…</div>
          <div className="mini-chips"><span>📷 photo added</span></div>
        </div>
        <div className="mini-bubble">Is the leak steady or only when the tap runs?</div>
      </Step>
      <Step n={2} h="One firm price from one vetted local tradie"
        p="No bidding wars, no five phone calls. We match one vetted, licensed tradie and you get one firm, GST-inclusive price — usually in minutes.">
        <div className="mini-card">
          <div className="mini-trade"><span className="mini-avatar">N</span> Newtown Plumbing Co <span className="mini-badge">✓ vetted</span></div>
          <div className="mini-price">$240</div>
          <div className="mini-sub">Firm price · incl. GST · tomorrow 8–10am</div>
          <div className="mini-btn">Accept quote</div>
        </div>
      </Step>
      <Step n={3} h="Pay only when it's done"
        p="Your money is held securely — the tradie sees it's real, but nothing is charged until you say the job's complete. If something's wrong, it stays held while we sort it.">
        <div className="mini-card">
          <div className="mini-lbl">Job complete</div>
          <div className="mini-timeline">
            <span className="done">Booked</span><span className="done">On site</span><span className="done">Done ✓</span>
          </div>
          <div className="mini-sub">$240 released to Newtown Plumbing Co</div>
          <div className="mini-btn ghost">Leave a review</div>
        </div>
      </Step>
    </div>
  );
}

function TradieSteps() {
  return (
    <div className="hiw">
      <Step n={1} h="Jobs arrive already specced"
        p="No vague 'how much to fix my thing?' calls. Every lead lands with photos, symptoms, access notes and the questions already asked — you know if it's worth your time before you leave the ute.">
        <div className="mini-card">
          <div className="mini-lbl">New job — assigned to you</div>
          <div className="mini-trade">Leaking kitchen sink · Newtown</div>
          <div className="mini-sub">Photos ✓ · Scope ✓ · Access notes ✓</div>
          <div className="mini-chips"><span>urgent</span><span>2km away</span></div>
        </div>
      </Step>
      <Step n={2} h="Quote in two minutes, not two hours"
        p="Your Copilot drafts the quote from the job spec and your rates — you check it, tweak it, send it. You'll see the moment the customer opens it.">
        <div className="mini-card">
          <div className="mini-lbl">Copilot draft</div>
          <div className="mini-price">$240</div>
          <div className="mini-sub">Replace flexi hose + reseal · 1.5h</div>
          <div className="mini-btn">Send quote</div>
          <div className="mini-seen">Seen by the customer ✓</div>
        </div>
      </Step>
      <Step n={3} h="The money's already waiting"
        p="Accepted means the customer's payment is held before you start. Mark it done, they confirm, you're paid — no invoicing, no chasing, and a review that builds your rank.">
        <div className="mini-card">
          <div className="mini-lbl">Paid to you</div>
          <div className="mini-price">$228</div>
          <div className="mini-sub">$240 job · 5% only on completion</div>
          <div className="mini-timeline"><span className="done">Done</span><span className="done">Confirmed</span><span className="done">Paid ✓</span></div>
        </div>
      </Step>
    </div>
  );
}
