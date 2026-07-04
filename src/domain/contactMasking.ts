/**
 * §9 Contact-masking filter. All pre-booking chat runs through this to strip
 * phone numbers, emails and "call me on…" patterns — the main defence against
 * going off-platform. Returns the masked body and whether anything was redacted
 * (a redaction is logged as a leakage attempt by the caller).
 *
 * The placeholder must be inert to every pattern below (it is scanned again as
 * later patterns run over the mutating string) — in particular it must not
 * contain any CONTACT_PHRASES trigger word, or each redaction re-triggers the
 * filter and nests.
 */
const REDACTION = "[redacted]";

// Australian + generic phone shapes: +61 4xx, 04xx xxx xxx, (02) xxxx xxxx,
// 10-digit runs, and digit groups separated by spaces/dashes.
const PHONE_PATTERNS: RegExp[] = [
  /\+?\(?\d[\d\s().-]{7,}\d/g,
  /\b0[2-8]\d{8}\b/g,
  /\b04\d{2}\s?\d{3}\s?\d{3}\b/g,
];

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

// "call me on", "text me at", "reach me on", "whatsapp", "my number is"
const CONTACT_PHRASES =
  /\b(call|text|txt|ring|phone|whatsapp|reach|contact|email|mail)\s+(me|us)?\s*(on|at|via|through)?\b[:\s-]*/gi;

// Digits spelled out to dodge the number filter: "zero four one two..."
const SPELLED_DIGITS =
  /\b(?:(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)[\s-]*){6,}\b/gi;

export interface MaskResult {
  body: string;
  redacted: boolean;
}

export function maskContactInfo(input: string): MaskResult {
  let out = input;
  let redacted = false;

  const apply = (pattern: RegExp) => {
    pattern.lastIndex = 0;
    if (pattern.test(out)) {
      redacted = true;
      pattern.lastIndex = 0;
      out = out.replace(pattern, REDACTION);
    }
  };

  apply(EMAIL_PATTERN);
  for (const p of PHONE_PATTERNS) apply(p);
  apply(SPELLED_DIGITS);
  apply(CONTACT_PHRASES);

  // Tidy up: collapse runs of the placeholder (possibly separated by stray
  // punctuation left behind, e.g. "(") into a single token.
  out = out
    .replace(/\[redacted\][\s()[\].,-]*(?=\[redacted\])/g, "")
    .replace(/(\[redacted\]\s*){2,}/g, `${REDACTION} `)
    .replace(/\s{2,}/g, " ")
    .trim();

  return { body: out, redacted };
}
