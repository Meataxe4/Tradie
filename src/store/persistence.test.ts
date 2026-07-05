import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { MemoryStore } from "./memoryStore.js";
import { AuthService } from "../auth/authService.js";
import { MarketplaceService } from "../services/marketplaceService.js";
import { TriageService } from "../triage/triageService.js";
import { MockTriageClient } from "../triage/llmClient.js";

const dirs: string[] = [];
function tmpDbPath(): string {
  const d = mkdtempSync(join(tmpdir(), "squiz-db-"));
  dirs.push(d);
  return join(d, "test.db");
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe("SQLite persistence survives a reopen (simulated restart)", () => {
  it("keeps registered users and posted jobs across connections", async () => {
    const file = tmpDbPath();
    const NOW = "2026-07-04T00:00:00.000Z";

    // First "process": register a homeowner and post a job.
    const db1 = new Database(file);
    const store1 = new MemoryStore(db1);
    const auth1 = new AuthService(store1, "secret");
    const reg = auth1.register({ email: "persist@test.com", password: "hunter2hunter", name: "Percy", role: "homeowner" });
    const market1 = new MarketplaceService(store1, new TriageService({ llm: new MockTriageClient(), clock: () => NOW }), () => NOW);
    const { job } = await market1.createJob({
      homeowner_id: reg.user.id, description: "A power point in the bedroom is dead",
      photos: [], suburb: "Newtown", postcode: "2042", state: "NSW",
    });
    expect(["POSTED", "QUOTING"]).toContain(store1.jobs.get(job.id)?.status);
    db1.close();

    // Second "process": reopen the same file — data must still be there.
    const db2 = new Database(file);
    const store2 = new MemoryStore(db2);
    expect(store2.usersByEmail.has("persist@test.com")).toBe(true);
    expect(store2.users.get(reg.user.id)?.email).toBe("persist@test.com");
    expect(store2.credentials.get(reg.user.id)).toBeTruthy();
    expect(store2.jobs.get(job.id)?.description).toContain("power point");
    expect(store2.triageByJob.get(job.id)).toBeTruthy();

    // A login in the new process works against the persisted credentials.
    const auth2 = new AuthService(store2, "secret");
    expect(auth2.login("persist@test.com", "hunter2hunter").user.id).toBe(reg.user.id);
    db2.close();
  });

  it("persists in-place status mutations via the service write-backs", async () => {
    const file = tmpDbPath();
    const NOW = "2026-07-04T00:00:00.000Z";
    const db1 = new Database(file);
    const store1 = new MemoryStore(db1);
    const market1 = new MarketplaceService(store1, new TriageService({ llm: new MockTriageClient(), clock: () => NOW }), () => NOW);
    // Seed a tradie so the job can be quoted + accepted.
    store1.users.set("t1", { id: "t1", role: "tradie", email: "t@x.com", created_at: NOW, status: "active" });
    store1.tradies.set("t1", {
      user_id: "t1", business_name: "T", abn: "1", trades: ["electrical"],
      licences: [{ number: "e", class: "Unrestricted electrical licence", state: "NSW", verified_status: "verified", expiry: "2027-01-01" }],
      insurance: {}, service_postcodes: ["2042"], rating_avg: 5, jobs_completed: 1, verified_status: "verified",
    });
    store1.users.set("h1", { id: "h1", role: "homeowner", email: "h@x.com", created_at: NOW, status: "active" });
    const { job } = await market1.createJob({ homeowner_id: "h1", description: "dead power point", photos: [], suburb: "Newtown", postcode: "2042", state: "NSW" });
    const q = market1.submitQuote({ job_id: job.id, tradie_id: "t1", amount: 15000, inclusions: "x" });
    market1.acceptQuote(q.id);
    db1.close();

    const db2 = new Database(file);
    const store2 = new MemoryStore(db2);
    expect(store2.jobs.get(job.id)?.status).toBe("BOOKED");
    expect(store2.quotes.get(q.id)?.status).toBe("accepted");
    expect([...store2.bookings.values()].some((b) => b.job_id === job.id)).toBe(true);
    db2.close();
  });
});
