/**
 * In-browser mock of the backend API, used only for the shareable live demo
 * (VITE_DEMO=1). It mirrors the real endpoints so the actual React app runs with
 * no server. The triage classification + safety gate here mirror the backend's
 * mock triage and src/triage/gate.ts; auth is simplified (no real crypto) since
 * this is a client-only demo.
 */
type Verdict = "DIY_SAFE" | "NEEDS_LICENSED_PRO" | "EMERGENCY_STOP" | "UNCLEAR";
type Role = "homeowner" | "tradie" | "admin";

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
const nowIso = () => new Date().toISOString();

const GENERAL_DISCLAIMER =
  "This is general guidance to help you understand the problem — not professional or licensed advice. A diagnosis from a photo can be wrong; a licensed tradesperson will confirm on site.";
const DIY_DISCLAIMER =
  "Only attempt this if you're confident and it feels safe. If in doubt, stop and get a licensed tradesperson.";

interface Store {
  users: Map<string, any>;
  homeowners: Map<string, any>;
  tradies: Map<string, any>;
  jobs: Map<string, any>;
  triages: Map<string, { result: any; overrides: any[]; model_verdict: Verdict }>;
  quotes: Map<string, any>;
  threads: Map<string, any>;
  messages: Map<string, any>;
  bookings: Map<string, any>;
  reviews: Map<string, any>;
  passwords: Map<string, string>; // email -> password
  emailToId: Map<string, string>;
  names: Map<string, string>;
  demoIds: Set<string>;
}

const db: Store = {
  users: new Map(), homeowners: new Map(), tradies: new Map(), jobs: new Map(),
  triages: new Map(), quotes: new Map(), threads: new Map(), messages: new Map(),
  bookings: new Map(), reviews: new Map(), passwords: new Map(), emailToId: new Map(),
  names: new Map(), demoIds: new Set(),
};

// ---------- triage (mirrors the backend mock) ----------
function classify(desc: string) {
  const t = desc.toLowerCase();
  const has = (...w: string[]) => w.some((x) => t.includes(x));
  const base = { confidence: "medium", likely_causes: [], clarifying_questions: [], disclaimer: GENERAL_DISCLAIMER };

  if (has("gas smell", "smell gas", "gas leak"))
    return { verdict: "EMERGENCY_STOP", category: "gas", regulated_domains: ["gas"], safety_flags: ["gas_odour"], recommended_trade: "gasfitter", required_licence_class: null, diy_guidance: null, why_pro_needed: "Immediate hazard and regulated work.", job_spec: spec("Suspected gas leak", "Reported gas odour.", ["Smell of gas"], [], "emergency"), user_message: "Please act on this now: leave the area, don't operate any switches or flames, and call the gas emergency line on 1800 GAS LEAK (1800 427 532). Evacuate if the smell is strong. When you're safe, I can line up a licensed gasfitter for you.", ...base };
  if (has("burning smell", "smoke", "sparks", "sparking", "scorch", "buzzing", "hot outlet"))
    return { verdict: "EMERGENCY_STOP", category: "electrical", regulated_domains: ["electrical"], safety_flags: ["fire_risk", "electrical_hazard"], recommended_trade: "electrician", required_licence_class: null, diy_guidance: null, why_pro_needed: "Immediate fire hazard and regulated work.", job_spec: spec("Burning smell / sparking from electrical fitting", "Possible electrical fault presenting a fire risk.", ["Burning smell", "Possible sparking"], [], "emergency"), user_message: "Please act on this now: if it's safe to reach, switch the power off at your main switch, and if you see smoke or flames call 000. Do not keep using that circuit. Once you're safe, I can line up a licensed electrician for you.", ...base };
  if (has("water near", "wet meter", "water and power"))
    return { verdict: "EMERGENCY_STOP", category: "electrical", regulated_domains: ["electrical"], safety_flags: ["water_and_electrical"], recommended_trade: "electrician", required_licence_class: null, diy_guidance: null, why_pro_needed: "Water near electrical fittings is a shock and fire risk.", job_spec: spec("Water near electrical fittings", "Water present near electrical fittings.", ["Water near meter box / outlets"], [], "emergency"), user_message: "Please don't touch anything electrical. If it's safe to reach, switch the power off at your main switch, then get a licensed electrician.", ...base };
  if (has("power point", "powerpoint", "power outlet", "outlet", "gpo", "light switch", "downlight", "ceiling fan")) {
    const fitting = has("ceiling fan") ? "ceiling fan" : has("downlight") ? "downlight" : has("light switch") || has("switch") ? "light switch" : "power point";
    return { verdict: "NEEDS_LICENSED_PRO", category: "electrical", regulated_domains: ["electrical"], safety_flags: ["none"], recommended_trade: "electrician", required_licence_class: "Unrestricted electrical licence", diy_guidance: null, why_pro_needed: "Fixed fittings connect to fixed wiring. In Australia this is licensed electrical work — it's illegal and unsafe to DIY.", job_spec: spec(`Faulty ${fitting}`, `A ${fitting} has stopped working and needs a licensed electrician.`, [`${fitting} not working`], ["Are other outlets on the same wall affected?", "Has the safety switch tripped?"], "routine"), user_message: "This one needs a licensed electrician — I've written up the details so you'll get accurate private quotes shortly.", ...base };
  }
  if (has("gas hot water", "gas cooktop", "gas heater", "gas appliance"))
    return { verdict: "NEEDS_LICENSED_PRO", category: "gas", regulated_domains: ["gas"], safety_flags: ["none"], recommended_trade: "gasfitter", required_licence_class: "Gasfitting licence", diy_guidance: null, why_pro_needed: "Gas work is licensed — it must be done by a licensed gasfitter.", job_spec: spec("Gas appliance fault", "A gas appliance needs a licensed gasfitter.", ["Gas appliance not operating correctly"], ["Is the pilot light staying lit?"], "routine"), user_message: "This needs a licensed gasfitter — gas work isn't a DIY job. You'll get accurate private quotes shortly.", ...base };
  if (has("burst pipe", "leaking pipe", "pipe leak", "tap replace", "mixer", "cistern", "hot water system", "no hot water"))
    return { verdict: "NEEDS_LICENSED_PRO", category: "plumbing_water", regulated_domains: ["plumbing_water"], safety_flags: ["none"], recommended_trade: "plumber", required_licence_class: "Plumbing contractor licence", diy_guidance: null, why_pro_needed: "Water/sewer-connected plumbing is licensed work — it needs a licensed plumber.", job_spec: spec("Water-connected plumbing fault", "A water/sewer-connected plumbing issue needs a licensed plumber.", ["Leak or fault on water-connected plumbing"], ["Have you turned off the water at the mains?"], "urgent"), user_message: "This needs a licensed plumber — water-connected plumbing isn't a DIY job. You'll get accurate private quotes shortly.", ...base };
  if (has("oven", "dishwasher", "washing machine", "clothes dryer", "rangehood", "range hood", "electric cooktop"))
    return { verdict: "NEEDS_LICENSED_PRO", category: "appliance", regulated_domains: ["none"], safety_flags: ["none"], recommended_trade: "handyman", required_licence_class: null, diy_guidance: null, why_pro_needed: "A fixed appliance repair — best handled by a qualified appliance technician.", job_spec: spec("Appliance repair", "A household appliance has stopped working correctly.", ["Appliance not operating as expected"], ["What's the make and model?"], "routine"), user_message: "This looks like an appliance repair. You'll get private quotes from qualified technicians shortly.", ...base };
  if (has("cabinet", "hinge", "door won't close", "drawer", "sticking door", "squeaky door"))
    return { verdict: "DIY_SAFE", category: "carpentry", regulated_domains: ["none"], safety_flags: ["none"], recommended_trade: "handyman", required_licence_class: null, diy_guidance: { steps: ["Open the door and check the hinge screws are all present and seated.", "Tighten the two screws on each hinge plate with a Phillips screwdriver.", "If the door still rubs, loosen the depth adjustment screw a quarter turn and re-test."], tools_required: ["Phillips screwdriver"], stop_conditions: ["If the hinge is cracked or the cabinet is pulling off the wall, stop — that's a mounting issue for a handyman/carpenter."] }, why_pro_needed: null, job_spec: null, user_message: "This is almost always loose hinge screws — an easy fix. Here's how.", ...base, disclaimer: `${GENERAL_DISCLAIMER} ${DIY_DISCLAIMER}` };
  if (has("blocked sink", "blocked basin", "slow drain", "draining slow", "clogged sink", "blocked toilet"))
    return { verdict: "DIY_SAFE", category: "plumbing_water", regulated_domains: ["none"], safety_flags: ["none"], recommended_trade: "plumber", required_licence_class: null, diy_guidance: { steps: ["Remove any visible hair or debris from the drain opening or strainer.", "Fill the basin with a few centimetres of water and work a cup plunger over the drain 10–15 times."], tools_required: ["Cup plunger", "Rubber gloves"], stop_conditions: ["Do not dismantle the pipes or the P-trap.", "If the blockage won't clear, or more than one fixture is affected, stop and call a licensed plumber."] }, why_pro_needed: null, job_spec: null, user_message: "A plunger clears most simple blockages. If it won't budge, it's time for a licensed plumber.", ...base, disclaimer: `${GENERAL_DISCLAIMER} ${DIY_DISCLAIMER}` };

  return { verdict: "UNCLEAR", category: "other", regulated_domains: ["none"], safety_flags: ["none"], recommended_trade: "none", required_licence_class: null, diy_guidance: null, why_pro_needed: null, job_spec: null, clarifying_questions: ["Is there any burning smell, smoke or sparking?", "Is there any water near electrical fittings?", "Whereabouts in the home is the problem, and when did it start?"], user_message: "I need a little more detail to route this safely — could you answer the questions below?", confidence: "low", likely_causes: [], disclaimer: GENERAL_DISCLAIMER };
}
function spec(title: string, summary: string, symptoms: string[], questions: string[], urgency: string) {
  return { title, summary, symptoms, access_notes: "", questions_for_site_visit: questions, urgency, photos_attached: false };
}

// ---------- gate (mirrors src/triage/gate.ts) ----------
const CATEGORY_REGULATED = new Set(["electrical", "gas", "plumbing_water", "hvac", "structural"]);
const REG_DOMAINS = new Set(["electrical", "gas", "plumbing_water"]);
const RANK: Record<Verdict, number> = { DIY_SAFE: 0, UNCLEAR: 1, NEEDS_LICENSED_PRO: 2, EMERGENCY_STOP: 3 };
const BANNED = [/\bwir(?:e|es|ing)\b/i, /\bgas\b/i, /\bcircuit\b/i, /\bswitchboard\b/i, /\bfuse\b/i, /\bvolts?\b/i, /\bamps?\b/i, /\bcut the pipe\b/i, /\bsolder\b/i, /\brefrigerant\b/i, /\basbestos\b/i];
const mx = (a: Verdict, b: Verdict): Verdict => (RANK[a] >= RANK[b] ? a : b);

function gate(triageId: string, model: any) {
  const overrides: any[] = [];
  let verdict: Verdict = model.verdict;
  let diy = model.diy_guidance;
  const rec = (reason: string, to: Verdict, detail: string) => {
    const from = verdict; verdict = mx(verdict, to);
    if (verdict !== from) overrides.push({ reason, from_verdict: from, to_verdict: verdict, detail });
  };
  const flags = (model.safety_flags || []).filter((f: string) => f !== "none");
  if (flags.length) rec("safety_flag_forces_emergency_stop", "EMERGENCY_STOP", `active flags: ${flags.join(", ")}`);
  if (CATEGORY_REGULATED.has(model.category)) rec("regulated_category_forces_pro", "NEEDS_LICENSED_PRO", `category '${model.category}' is regulated`);
  if ((model.regulated_domains || []).some((d: string) => REG_DOMAINS.has(d))) rec("regulated_domain_forces_pro", "NEEDS_LICENSED_PRO", `regulated_domains: ${model.regulated_domains.join(", ")}`);
  if (diy) {
    const texts = [...diy.steps, ...diy.tools_required];
    if (BANNED.some((re) => texts.some((x: string) => re.test(x)))) rec("banned_content_in_diy_guidance", "NEEDS_LICENSED_PRO", "banned content in DIY guidance");
  }
  if (verdict !== "DIY_SAFE" && diy) { overrides.push({ reason: "diy_guidance_stripped", from_verdict: model.verdict, to_verdict: verdict, detail: "DIY steps removed because final verdict is not DIY_SAFE" }); diy = null; }

  const whyPro = verdict !== "DIY_SAFE" ? model.why_pro_needed ?? "This is regulated or hazardous work — it needs a licensed tradesperson." : null;
  const result = {
    triage_id: triageId, verdict, confidence: model.confidence, category: model.category,
    regulated_domains: model.regulated_domains, safety_flags: model.safety_flags,
    likely_causes: model.likely_causes ?? [], recommended_trade: model.recommended_trade,
    required_licence_class: model.required_licence_class ?? (model.recommended_trade === "electrician" ? "Unrestricted electrical licence" : null),
    clarifying_questions: verdict === "UNCLEAR" ? model.clarifying_questions ?? [] : [],
    diy_guidance: verdict === "DIY_SAFE" ? diy : null, why_pro_needed: whyPro,
    job_spec: model.job_spec, user_message: model.user_message, disclaimer: model.disclaimer,
  };
  return { result, overrides, model_verdict: model.verdict as Verdict };
}

// ---------- matching ----------
function tradieMatches(tr: any, job: any, requiredClass: string | null): boolean {
  if (tr.verified_status !== "verified") return false;
  if (!tr.trades.includes(job.category)) return false;
  if (!tr.service_postcodes.includes(job.postcode)) return false;
  if (requiredClass === null) return true;
  return tr.licences.some((l: any) => l.verified_status === "verified" && l.state === job.state && (l.class || "").toLowerCase().includes((requiredClass.split(" ")[1] || "").toLowerCase()));
}

// ---------- views (masking, §9) ----------
function tradieSummary(id: string) {
  const t = db.tradies.get(id); const u = db.users.get(id);
  if (!t) return null;
  return { tradie_id: id, business_name: t.business_name, rating_avg: t.rating_avg, jobs_completed: t.jobs_completed, response_minutes: t.avg_response_minutes ?? null, verified: t.verified_status === "verified", licence_class: t.licences[0]?.class ?? null, licence_verified: t.licences[0]?.verified_status === "verified", insured: !!t.insurance?.public_liability_expiry, member_since: u?.created_at ?? null };
}
function quoteView(q: any) {
  return { quote_id: q.id, job_id: q.job_id, tradie: tradieSummary(q.tradie_id), amount: q.amount, inclusions: q.inclusions, earliest_availability: q.earliest_availability, status: q.status, created_at: q.created_at };
}
function quotesForJob(jobId: string) { return [...db.quotes.values()].filter((q) => q.job_id === jobId); }
function leadView(job: any, tradieId: string) {
  const tri = db.triages.get(job.id); const booking = [...db.bookings.values()].find((b) => b.job_id === job.id && b.tradie_id === tradieId); const won = !!booking;
  const owner = db.users.get(job.homeowner_id);
  const mine = quotesForJob(job.id).find((q) => q.tradie_id === tradieId);
  return { job_id: job.id, category: job.category, suburb: job.suburb, full_address: won ? job.full_address ?? null : null, urgency: job.urgency, status: job.status, job_spec: tri?.result.job_spec ?? null, why_pro_needed: tri?.result.why_pro_needed ?? null, required_licence_class: tri?.result.required_licence_class ?? null, photos: job.photos, created_at: job.created_at, quote_count: quotesForJob(job.id).filter((q) => q.status !== "declined").length, poster: { suburb: job.suburb, member_since: owner?.created_at ?? null, verified: true }, my_quote: mine ? quoteView(mine) : null };
}

// ---------- marketplace ----------
function createJob(input: any) {
  const model = classify(input.description);
  const triageId = uid();
  const { result, overrides, model_verdict } = gate(triageId, model);
  const job: any = { id: uid(), homeowner_id: input.homeowner_id, category: input.category ?? result.category, description: input.description, photos: input.photos ?? [], suburb: input.suburb, postcode: input.postcode, state: input.state, full_address: input.full_address, urgency: result.job_spec?.urgency ?? "routine", status: "TRIAGED", created_at: input._at ?? nowIso() };
  db.jobs.set(job.id, job);
  db.triages.set(job.id, { result, overrides, model_verdict });
  let matched: string[] = [];
  if (result.verdict === "DIY_SAFE") { job.status = "DIY_RESOLVED"; }
  else {
    job.status = "POSTED";
    matched = [...db.tradies.values()].filter((tr) => tradieMatches(tr, job, result.required_licence_class)).map((tr) => tr.user_id);
    if (matched.length) job.status = "QUOTING";
  }
  return { job, triage: result, overrides, model_verdict, matched_tradies: matched };
}
function jobSummary(job: any) {
  const tri = db.triages.get(job.id);
  return { ...job, verdict: tri?.result.verdict ?? null, quote_count: quotesForJob(job.id).filter((q) => q.status !== "declined").length };
}

// ---------- contact masking (§9) ----------
function mask(input: string) {
  let out = input; let redacted = false;
  const R = "[redacted]";
  const apply = (re: RegExp) => { if (re.test(out)) { redacted = true; out = out.replace(re, R); } };
  apply(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi);
  apply(/\+?\(?\d[\d\s().-]{7,}\d/g);
  apply(/\b(call|text|ring|phone|whatsapp|reach|contact|email)\s+(me|us)?\s*(on|at|via)?\b[:\s-]*/gi);
  out = out.replace(/(\[redacted\]\s*){2,}/g, `${R} `).replace(/\s{2,}/g, " ").trim();
  return { body: out, redacted };
}

// ---------- auth (simplified for the demo) ----------
function token(u: any) { return btoa(unescape(encodeURIComponent(JSON.stringify({ sub: u.id, role: u.role, email: u.email, name: db.names.get(u.id) ?? u.email })))); }
function decode(h?: string) { if (!h?.startsWith("Bearer ")) return null; try { return JSON.parse(decodeURIComponent(escape(atob(h.slice(7))))); } catch { return null; } }
function authResult(u: any) { const name = db.names.get(u.id) ?? u.email; return { token: token(u), user: { id: u.id, role: u.role, email: u.email, name } }; }

// ---------- seed ----------
function seed() {
  const mkTradie = (id: string, email: string, name: string, biz: string, trades: string[], cls: string, pcs: string[], rating: number, jobs: number, resp: number) => {
    db.users.set(id, { id, role: "tradie", email, created_at: "2024-03-01T00:00:00.000Z", status: "active" });
    db.tradies.set(id, { user_id: id, business_name: biz, abn: "12345678901", trades, licences: [{ number: "L1", class: cls, state: "NSW", verified_status: "verified", expiry: "2027-01-01" }], insurance: { public_liability_expiry: "2027-01-01" }, service_postcodes: pcs, rating_avg: rating, jobs_completed: jobs, verified_status: "verified", avg_response_minutes: resp });
    db.names.set(id, name); db.emailToId.set(email, id); db.demoIds.add(id);
  };
  db.users.set("home-1", { id: "home-1", role: "homeowner", email: "owner@example.com", created_at: "2025-06-01T00:00:00.000Z", status: "active" });
  db.homeowners.set("home-1", { user_id: "home-1", suburb: "Newtown", postcode: "2042" });
  db.names.set("home-1", "Alex (homeowner)"); db.emailToId.set("owner@example.com", "home-1"); db.demoIds.add("home-1");
  mkTradie("spark-1", "spark@example.com", "Sam · Inner West Electrical", "Inner West Electrical", ["electrical", "appliance"], "Unrestricted electrical licence", ["2042", "2040", "2037"], 4.8, 40, 20);
  mkTradie("plumb-1", "plumb@example.com", "Pat · Newtown Plumbing Co", "Newtown Plumbing Co", ["plumbing_water"], "Plumbing contractor licence", ["2042", "2043"], 4.6, 25, 35);

  const t0 = Date.now();
  const demoJobs = [
    { at: -8 * 3600e3, d: "The oven has stopped heating up properly" },
    { at: -6 * 3600e3, d: "A ceiling fan in the lounge won't turn on" },
    { at: -5 * 3600e3, d: "There's a burst pipe under the kitchen sink" },
    { at: -3 * 3600e3, d: "The downlight in the kitchen has stopped working" },
    { at: -75 * 60e3, d: "There's a burning smell coming from the switchboard" },
    { at: -20 * 60e3, d: "A power point in the bedroom is dead" },
  ];
  for (const j of demoJobs) createJob({ homeowner_id: "home-1", description: j.d, photos: ["p1"], suburb: "Newtown", postcode: "2042", state: "NSW", full_address: "1 Example St, Newtown NSW 2042", _at: new Date(t0 + j.at).toISOString() });
}
seed();

// ---------- request dispatch ----------
interface Res { status: number; body: any; }
const ok = (body: any, status = 200): Res => ({ status, body });
const err = (status: number, msg: string): Res => ({ status, body: { error: msg } });

export function handleRequest(method: string, path: string, body: any, authHeader?: string): Res {
  const seg = path.replace(/^\/api/, "").split("?")[0]!.split("/").filter(Boolean);
  const user = decode(authHeader);
  const need = (...roles: Role[]): any => { if (!user) throw err(401, "Sign in to continue"); if (!roles.includes(user.role)) throw err(403, "Wrong role"); return user; };

  try {
    // auth
    if (method === "POST" && seg[0] === "auth" && seg[1] === "register") return doRegister(body);
    if (method === "POST" && seg[0] === "auth" && seg[1] === "login") return doLogin(body);
    if (method === "POST" && seg[0] === "auth" && seg[1] === "demo") { const id = seg[2]!; const u = db.users.get(id); if (!u || !db.demoIds.has(id)) return err(404, "Unknown demo account"); return ok(authResult(u)); }
    if (method === "GET" && seg[0] === "demo" && seg[1] === "identities") return ok([...db.demoIds].map((id) => db.users.get(id)).filter((u) => u && u.role !== "admin").map((u) => ({ id: u.id, role: u.role, label: db.names.get(u.id) ?? u.email })));
    if (method === "GET" && seg[0] === "me") { const u = need("homeowner", "tradie"); return ok({ id: u.sub, role: u.role, name: u.name }); }

    // homeowner
    if (method === "POST" && seg[0] === "jobs" && seg.length === 1) { const u = need("homeowner"); if (!body?.description) return err(400, "description required"); const r = createJob({ ...body, homeowner_id: u.sub }); return ok({ job: jobSummary(r.job), triage: r.triage, overrides: r.overrides, model_verdict: r.model_verdict, matched_tradies: r.matched_tradies }, 201); }
    if (method === "GET" && seg[0] === "jobs" && seg.length === 1) { const u = need("homeowner"); return ok([...db.jobs.values()].filter((j) => j.homeowner_id === u.sub).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(jobSummary)); }
    if (method === "GET" && seg[0] === "jobs" && seg.length === 2) { const u = need("homeowner"); const job = db.jobs.get(seg[1]!); if (!job || job.homeowner_id !== u.sub) return err(404, "Job not found"); const tri = db.triages.get(job.id); const booking = [...db.bookings.values()].find((b) => b.job_id === job.id) ?? null; return ok({ ...job, triage: tri?.result ?? null, booking }); }
    if (method === "GET" && seg[0] === "jobs" && seg[2] === "quotes") { const u = need("homeowner"); const job = db.jobs.get(seg[1]!); if (!job || job.homeowner_id !== u.sub) return err(404, "Job not found"); return ok(quotesForJob(job.id).map(quoteView)); }
    if (method === "POST" && seg[0] === "quotes" && seg[2] === "accept") return doAccept(need("homeowner"), seg[1]!);

    // tradie
    if (method === "GET" && seg[0] === "leads" && seg.length === 1) { const u = need("tradie"); const tr = db.tradies.get(u.sub); return ok([...db.jobs.values()].filter((j) => (j.status === "POSTED" || j.status === "QUOTING") && db.triages.get(j.id) && tradieMatches(tr, j, db.triages.get(j.id)!.result.required_licence_class)).map((j) => leadView(j, u.sub))); }
    if (method === "GET" && seg[0] === "leads" && seg.length === 2) { const u = need("tradie"); const job = db.jobs.get(seg[1]!); if (!job) return err(404, "Lead not found"); return ok(leadView(job, u.sub)); }
    if (method === "POST" && seg[0] === "jobs" && seg[2] === "quotes") return doQuote(need("tradie"), seg[1]!, body);
    if (method === "GET" && seg[0] === "me" && seg[1] === "quotes") { const u = need("tradie"); return ok([...db.quotes.values()].filter((q) => q.tradie_id === u.sub).map((q) => ({ ...quoteView(q), thread_id: q.id, job: db.jobs.get(q.job_id) ? leadView(db.jobs.get(q.job_id), u.sub) : null }))); }
    if (method === "GET" && seg[0] === "me" && seg[1] === "leads" && seg[2] === "won") { const u = need("tradie"); return ok([...db.bookings.values()].filter((b) => b.tradie_id === u.sub).map((b) => ({ booking: b, thread_id: b.quote_id, job: db.jobs.get(b.job_id) ? leadView(db.jobs.get(b.job_id), u.sub) : null }))); }

    // shared
    if (seg[0] === "threads" && seg[2] === "messages") {
      const u = need("homeowner", "tradie"); const thread = db.threads.get(seg[1]!); if (!thread) return err(404, "Thread not found");
      if (method === "GET") return ok([...db.messages.values()].filter((m) => m.thread_id === seg[1]).sort((a, b) => a.created_at.localeCompare(b.created_at)));
      const { body: mbody, redacted } = mask(String(body?.body ?? "")); const msg = { id: uid(), thread_id: seg[1], sender_role: u.role === "tradie" ? "tradie" : "homeowner", body: mbody, redacted, created_at: nowIso() }; db.messages.set(msg.id, msg); return ok(msg, 201);
    }
    if (method === "POST" && seg[0] === "bookings" && seg[2] === "complete") { need("homeowner", "tradie"); const b = db.bookings.get(seg[1]!); if (!b) return err(404, "Booking not found"); b.status = "completed"; const job = db.jobs.get(b.job_id); job.status = "COMPLETED"; return ok(b); }
    if (method === "POST" && seg[0] === "bookings" && seg[2] === "review") { need("homeowner"); const b = db.bookings.get(seg[1]!); if (!b || b.status !== "completed") return err(400, "Reviews can only be left after a completed booking"); const rv = { id: uid(), booking_id: b.id, rating: Number(body?.rating), text: String(body?.text ?? ""), created_at: nowIso() }; db.reviews.set(rv.id, rv); const job = db.jobs.get(b.job_id); job.status = "REVIEWED"; const tr = db.tradies.get(b.tradie_id); if (tr) { tr.rating_avg = (tr.rating_avg * tr.jobs_completed + rv.rating) / (tr.jobs_completed + 1); tr.jobs_completed += 1; } return ok(rv, 201); }

    return err(404, "Not found");
  } catch (e: any) {
    if (e && typeof e.status === "number") return e as Res;
    return err(400, e?.message ?? "Error");
  }
}

function doRegister(body: any): Res {
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err(400, "Enter a valid email address");
  if (!body?.password || body.password.length < 8) return err(400, "Password must be at least 8 characters");
  if (!body?.name?.trim()) return err(400, "Name is required");
  if (db.emailToId.has(email)) return err(409, "An account with that email already exists");
  const id = uid(); const role: Role = body.role === "tradie" ? "tradie" : "homeowner";
  db.users.set(id, { id, role, email, created_at: nowIso(), status: "active" });
  db.emailToId.set(email, id); db.passwords.set(email, body.password); db.names.set(id, body.name.trim());
  if (role === "homeowner") db.homeowners.set(id, { user_id: id, suburb: body.suburb, postcode: body.postcode });
  else db.tradies.set(id, { user_id: id, business_name: body.business_name?.trim() || body.name.trim(), abn: body.abn ?? "", trades: body.trades ?? [], licences: body.licence_class ? [{ number: body.licence_number ?? "", class: body.licence_class, state: body.state ?? "NSW", verified_status: "pending" }] : [], insurance: {}, service_postcodes: body.service_postcodes ?? [], rating_avg: 0, jobs_completed: 0, verified_status: "pending" });
  return ok(authResult(db.users.get(id)), 201);
}
function doLogin(body: any): Res {
  const email = String(body?.email ?? "").trim().toLowerCase(); const id = db.emailToId.get(email);
  if (!id || db.passwords.get(email) !== body?.password) return err(401, "Incorrect email or password");
  return ok(authResult(db.users.get(id)));
}
function doAccept(u: any, quoteId: string): Res {
  const q = db.quotes.get(quoteId); if (!q) return err(404, "Quote not found"); const job = db.jobs.get(q.job_id); if (!job || job.homeowner_id !== u.sub) return err(403, "Not your job");
  q.status = "accepted";
  for (const o of quotesForJob(job.id)) if (o.id !== q.id && o.status === "submitted") o.status = "declined";
  job.status = "BOOKED";
  const booking = { id: uid(), job_id: job.id, quote_id: q.id, tradie_id: q.tradie_id, status: "scheduled", scheduled_for: q.earliest_availability };
  db.bookings.set(booking.id, booking);
  return ok({ quote: quoteView(q), booking });
}
function doQuote(u: any, jobId: string, body: any): Res {
  const job = db.jobs.get(jobId); if (!job) return err(404, "Job not found");
  if (typeof body?.amount !== "number") return err(400, "amount required");
  const q = { id: uid(), job_id: jobId, tradie_id: u.sub, amount: body.amount, inclusions: String(body.inclusions ?? ""), earliest_availability: body.earliest_availability, status: "submitted", created_at: nowIso() };
  db.quotes.set(q.id, q); db.threads.set(q.id, { id: q.id, quote_id: q.id, job_id: jobId });
  if (job.status === "POSTED") job.status = "QUOTING";
  return ok({ quote_id: q.id, status: q.status, thread_id: q.id }, 201);
}
