import { describe, it, expect } from "vitest";
import { maskContactInfo } from "./contactMasking.js";

describe("contact masking (§9)", () => {
  it("redacts an Australian mobile number", () => {
    const { body, redacted } = maskContactInfo("Call me on 0412 345 678 to sort it");
    expect(redacted).toBe(true);
    expect(body).not.toContain("0412");
  });

  it("redacts a landline", () => {
    const { redacted, body } = maskContactInfo("ring (02) 9876 5432");
    expect(redacted).toBe(true);
    expect(body).not.toContain("9876");
  });

  it("redacts an email address", () => {
    const { body, redacted } = maskContactInfo("email me at bob@builder.com.au");
    expect(redacted).toBe(true);
    expect(body).not.toContain("bob@builder.com.au");
  });

  it("redacts spelled-out digits used to dodge the filter", () => {
    const { redacted } = maskContactInfo("my number is zero four one two three four five six seven eight");
    expect(redacted).toBe(true);
  });

  it("leaves a clean message untouched", () => {
    const clean = "Sounds good, I'm free Tuesday morning for the quote.";
    const { body, redacted } = maskContactInfo(clean);
    expect(redacted).toBe(false);
    expect(body).toBe(clean);
  });

  it("produces a clean placeholder that never nests or garbles", () => {
    const { body } = maskContactInfo("Great, call me on 0412 345 678");
    expect(body).toBe("Great, [redacted]");
    // The placeholder must not re-trigger the phrase filter (no "[[…]" nesting).
    expect(body).not.toMatch(/\[\[/);
    expect(body).not.toContain("contact removed");
  });

  it("collapses multiple redactions in one message", () => {
    const { body } = maskContactInfo("email me at bob@builder.com.au or ring (02) 9876 5432");
    expect(body).not.toMatch(/\d{4}/);
    expect(body).not.toContain("@");
    expect(body).not.toMatch(/\[\[/);
  });
});
