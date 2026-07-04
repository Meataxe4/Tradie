import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStore } from "../store/memoryStore.js";
import { AuthService, AuthError } from "./authService.js";
import { seed } from "../seed.js";
import { signToken, verifyToken, TokenError } from "./tokens.js";
import { hashPassword, verifyPassword } from "./passwords.js";

const SECRET = "test-secret";

function svc() {
  const store = new MemoryStore();
  return { store, auth: new AuthService(store, SECRET) };
}

describe("passwords", () => {
  it("verifies a correct password and rejects a wrong one", () => {
    const h = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
  });
});

describe("tokens", () => {
  it("round-trips a payload", () => {
    const t = signToken({ sub: "u1", role: "homeowner", email: "a@b.com" }, SECRET);
    const p = verifyToken(t, SECRET);
    expect(p.sub).toBe("u1");
    expect(p.role).toBe("homeowner");
  });
  it("rejects a tampered token", () => {
    const t = signToken({ sub: "u1", role: "homeowner", email: "a@b.com" }, SECRET);
    expect(() => verifyToken(t + "x", SECRET)).toThrow(TokenError);
    expect(() => verifyToken(t, "other-secret")).toThrow(TokenError);
  });
});

describe("register", () => {
  it("creates a homeowner and issues a working token", () => {
    const { store, auth } = svc();
    const r = auth.register({ email: "New@Example.com", password: "hunter2hunter", name: "Jo", role: "homeowner", suburb: "Newtown" });
    expect(r.user.role).toBe("homeowner");
    expect(verifyToken(r.token, SECRET).sub).toBe(r.user.id);
    expect(store.usersByEmail.get("new@example.com")).toBe(r.user.id);
    expect(store.homeowners.get(r.user.id)?.suburb).toBe("Newtown");
  });

  it("creates a tradie as unverified (won't match jobs until verified)", () => {
    const { store, auth } = svc();
    const r = auth.register({
      email: "t@example.com", password: "hunter2hunter", name: "Tess", role: "tradie",
      business_name: "Tess Electric", trades: ["electrical"], state: "NSW",
      service_postcodes: ["2042"], licence_class: "Unrestricted electrical licence",
    });
    const t = store.tradies.get(r.user.id)!;
    expect(t.verified_status).toBe("pending");
    expect(t.licences[0]?.verified_status).toBe("pending");
  });

  it("rejects duplicate emails and weak passwords", () => {
    const { auth } = svc();
    auth.register({ email: "dupe@example.com", password: "hunter2hunter", name: "A", role: "homeowner" });
    expect(() => auth.register({ email: "dupe@example.com", password: "hunter2hunter", name: "B", role: "homeowner" }))
      .toThrow(AuthError);
    expect(() => auth.register({ email: "x@example.com", password: "short", name: "C", role: "homeowner" }))
      .toThrow(/8 characters/);
  });
});

describe("login", () => {
  let ctx: ReturnType<typeof svc>;
  beforeEach(() => {
    ctx = svc();
    ctx.auth.register({ email: "user@example.com", password: "hunter2hunter", name: "U", role: "homeowner" });
  });

  it("succeeds with the right password", () => {
    const r = ctx.auth.login("USER@example.com", "hunter2hunter");
    expect(r.user.email).toBe("user@example.com");
  });
  it("rejects a wrong password and an unknown email", () => {
    expect(() => ctx.auth.login("user@example.com", "nope")).toThrow(/Incorrect/);
    expect(() => ctx.auth.login("ghost@example.com", "whatever")).toThrow(/Incorrect/);
  });
});

describe("demo login", () => {
  it("mints a token for a seeded demo account and rejects others", () => {
    const { store, auth } = svc();
    seed(store);
    expect(auth.demoLogin("home-1").user.id).toBe("home-1");
    expect(() => auth.demoLogin("not-a-demo")).toThrow(AuthError);
  });
});
