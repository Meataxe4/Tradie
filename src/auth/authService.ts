/**
 * Real authentication: registration + login over the store, issuing signed
 * session tokens. Passwords are scrypt-hashed; tokens are HS256 JWTs.
 *
 * Persistence is the in-memory store for now, so accounts reset on restart —
 * swap MemoryStore for a DB and this service is unchanged.
 */
import { v4 as uuidv4 } from "uuid";
import { MemoryStore } from "../store/memoryStore.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import { signToken, type TokenPayload } from "./tokens.js";
import type { AustralianState, Role, User } from "../domain/entities.js";
import type { Category } from "../triage/schema.js";

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  role: "homeowner" | "tradie";
  phone?: string;
  // homeowner
  suburb?: string;
  postcode?: string;
  // tradie
  business_name?: string;
  abn?: string;
  trades?: Category[];
  state?: AustralianState;
  service_postcodes?: string[];
  licence_class?: string;
  licence_number?: string;
}

export interface AuthResult {
  token: string;
  user: { id: string; role: Role; email: string; name: string };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class AuthService {
  constructor(
    private readonly store: MemoryStore,
    private readonly secret: string,
  ) {}

  register(input: RegisterInput): AuthResult {
    const email = input.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new AuthError(400, "Enter a valid email address");
    if (!input.password || input.password.length < 8) {
      throw new AuthError(400, "Password must be at least 8 characters");
    }
    if (!input.name?.trim()) throw new AuthError(400, "Name is required");
    if (this.store.usersByEmail.has(email)) {
      throw new AuthError(409, "An account with that email already exists");
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const user: User = { id, role: input.role, email, phone: input.phone, created_at: now, status: "active" };
    this.store.users.set(id, user);
    this.store.usersByEmail.set(email, id);
    this.store.credentials.set(id, hashPassword(input.password));
    this.store.displayNames.set(id, input.name.trim());

    if (input.role === "homeowner") {
      this.store.homeowners.set(id, {
        user_id: id,
        suburb: input.suburb,
        postcode: input.postcode,
      });
    } else {
      // New tradies start unverified — they won't match jobs until an admin
      // verifies their licence (§10). That's the correct, safe default.
      this.store.tradies.set(id, {
        user_id: id,
        business_name: input.business_name?.trim() || input.name.trim(),
        abn: input.abn ?? "",
        trades: input.trades ?? [],
        licences: input.licence_class
          ? [{
              number: input.licence_number ?? "",
              class: input.licence_class,
              state: input.state ?? "NSW",
              verified_status: "pending",
            }]
          : [],
        insurance: {},
        service_postcodes: input.service_postcodes ?? [],
        rating_avg: 0,
        jobs_completed: 0,
        verified_status: "pending",
      });
    }

    return this.result(user, input.name.trim());
  }

  login(email: string, password: string): AuthResult {
    const key = email.trim().toLowerCase();
    const id = this.store.usersByEmail.get(key);
    const hash = id ? this.store.credentials.get(id) : undefined;
    // Always run a verify to reduce timing signal, then check both conditions.
    const ok = hash ? verifyPassword(password, hash) : verifyPassword(password, DUMMY_HASH);
    if (!id || !hash || !ok) throw new AuthError(401, "Incorrect email or password");
    const user = this.store.users.get(id)!;
    return this.result(user, this.store.displayNames.get(id) ?? user.email);
  }

  /** Convenience: mint a token for a known seeded demo account (no password). */
  demoLogin(userId: string): AuthResult {
    const user = this.store.users.get(userId);
    if (!user || !this.store.demoAccountIds.has(userId)) {
      throw new AuthError(404, "Unknown demo account");
    }
    return this.result(user, this.store.displayNames.get(userId) ?? user.email);
  }

  private result(user: User, name: string): AuthResult {
    const payload: TokenPayload = { sub: user.id, role: user.role, email: user.email, name };
    return {
      token: signToken(payload, this.secret),
      user: { id: user.id, role: user.role, email: user.email, name },
    };
  }
}

// Fixed dummy hash so login of an unknown email still does one scrypt pass.
const DUMMY_HASH =
  "0000000000000000000000000000000000000000000000000000000000000000:" +
  "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
