import { describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import {
  AUTH_RATE_LIMIT_RULE,
  authAdvanced,
  authRateLimit,
  resolveTrustedOrigins,
} from "./auth-config";

describe("resolveTrustedOrigins", () => {
  it("trusts the base URL origin", () => {
    expect(resolveTrustedOrigins("http://localhost:3001")).toEqual(["http://localhost:3001"]);
    expect(resolveTrustedOrigins("https://app.example.com/some/path")).toEqual([
      "https://app.example.com",
    ]);
  });

  it("does not implicitly add localhost to a production base URL", () => {
    const origins = resolveTrustedOrigins("https://app.example.com");
    expect(origins).toEqual(["https://app.example.com"]);
    expect(origins.some((o) => o.includes("localhost"))).toBe(false);
  });

  it("adds explicitly listed origins, normalized and de-duplicated", () => {
    expect(
      resolveTrustedOrigins(
        "https://app.example.com",
        " https://preview.example.com ,https://app.example.com,",
      ),
    ).toEqual(["https://app.example.com", "https://preview.example.com"]);
  });

  it.each([
    "*",
    "https://*.example.com",
    "javascript:alert(1)",
    "ftp://example.com",
    "https://example.com/path",
    "https://user:pw@example.com",
    "not a url",
  ])("rejects an invalid extra origin: %s", (bad) => {
    expect(() => resolveTrustedOrigins("https://app.example.com", bad)).toThrow(/invalid origin/);
  });

  it("rejects a non-http(s) base URL", () => {
    expect(() => resolveTrustedOrigins("file:///etc/passwd")).toThrow();
    expect(() => resolveTrustedOrigins("nope")).toThrow();
  });
});

// Exercises the real Better Auth request pipeline with the same trusted-origin and rate-limit
// settings as src/lib/auth.ts, using its in-memory adapter (no database, no network).
// Limits of this setup: it proves our configuration is honored, not that src/lib/auth.ts is wired
// to it (that is covered by review and the production smoke test), and the limiter is in-memory.
const BASE_URL = "http://localhost:3001";

function makeAuth(baseURL = BASE_URL, extraOrigins?: string) {
  return betterAuth({
    secret: "test-secret-test-secret-test-secret-123456",
    baseURL,
    trustedOrigins: resolveTrustedOrigins(baseURL, extraOrigins),
    rateLimit: authRateLimit,
    advanced: authAdvanced,
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    emailAndPassword: { enabled: true },
  });
}

let counter = 0;
function request(
  auth: ReturnType<typeof makeAuth>,
  path: string,
  body: Record<string, string>,
  { origin, ip }: { origin?: string; ip?: string } = {},
) {
  counter += 1;
  const base = new URL(auth.options.baseURL as string).origin;
  return auth.handler(
    new Request(`${base}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Unique client per test so the shared in-memory limiter never leaks between tests.
        "x-forwarded-for": ip ?? `203.0.113.${counter % 250}`,
        ...(origin ? { origin } : {}),
        // A cookie header makes the origin check apply, as it does for a real browser session.
        cookie: "better-auth.session_token=x",
      },
      body: JSON.stringify(body),
    }),
  );
}

const signUpBody = (n: number) => ({
  name: "Test",
  email: `user${n}@example.com`,
  password: "correct-horse-battery",
});

describe("origin validation settings", () => {
  it("never disables origin or CSRF checks", () => {
    expect(authAdvanced).toEqual({ disableOriginCheck: false, disableCSRFCheck: false });
  });
});

describe("trusted origins (Better Auth pipeline)", () => {
  it("accepts the approved development origin", async () => {
    const res = await request(makeAuth(), "/sign-up/email", signUpBody(1), { origin: BASE_URL });
    expect(res.status).toBe(200);
  });

  it("rejects an unapproved origin", async () => {
    const res = await request(makeAuth(), "/sign-up/email", signUpBody(2), {
      origin: "https://evil.example",
    });
    expect(res.status).toBe(403);
  });

  it("rejects the same host on another port or scheme", async () => {
    const auth = makeAuth();
    for (const origin of [
      "http://localhost:3000",
      "https://localhost:3001",
      "http://127.0.0.1:3001",
    ]) {
      const res = await request(
        auth,
        "/sign-in/email",
        { email: "a@example.com", password: "x" },
        { origin },
      );
      expect(res.status, origin).toBe(403);
    }
  });

  it("accepts an explicitly approved extra origin and nothing else", async () => {
    const auth = makeAuth(BASE_URL, "https://preview.example.com");
    const ok = await request(auth, "/sign-up/email", signUpBody(3), {
      origin: "https://preview.example.com",
    });
    expect(ok.status).toBe(200);
    const bad = await request(auth, "/sign-up/email", signUpBody(4), {
      origin: "https://other.example.com",
    });
    expect(bad.status).toBe(403);
  });

  it("a production configuration does not trust localhost", async () => {
    const auth = makeAuth("https://app.example.com");
    const res = await request(auth, "/sign-up/email", signUpBody(5), {
      origin: "http://localhost:3001",
    });
    expect(res.status).toBe(403);
    const ok = await request(auth, "/sign-up/email", signUpBody(6), {
      origin: "https://app.example.com",
    });
    expect(ok.status).toBe(200);
  });
});

describe("rate limiting (Better Auth pipeline, in-memory storage)", () => {
  it("is enabled explicitly with the documented values", () => {
    expect(authRateLimit.enabled).toBe(true);
    expect(AUTH_RATE_LIMIT_RULE).toEqual({ window: 60, max: 5 });
    expect(authRateLimit.customRules["/sign-in/email"]).toBe(AUTH_RATE_LIMIT_RULE);
    expect(authRateLimit.customRules["/sign-up/email"]).toBe(AUTH_RATE_LIMIT_RULE);
  });

  it("rejects sign-in attempts beyond the limit, but not within it", async () => {
    const auth = makeAuth();
    const ip = "198.51.100.10";
    const statuses: number[] = [];
    for (let i = 0; i < AUTH_RATE_LIMIT_RULE.max + 2; i++) {
      const res = await request(
        auth,
        "/sign-in/email",
        { email: "nobody@example.com", password: "wrong-password" },
        { origin: BASE_URL, ip },
      );
      statuses.push(res.status);
    }
    // Wrong credentials are 401 while allowed; the next requests are throttled with 429.
    expect(statuses.slice(0, AUTH_RATE_LIMIT_RULE.max).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(AUTH_RATE_LIMIT_RULE.max)).toEqual([429, 429]);
  });

  it("throttles per client: another client is unaffected", async () => {
    const auth = makeAuth();
    for (let i = 0; i < AUTH_RATE_LIMIT_RULE.max + 1; i++) {
      await request(
        auth,
        "/sign-in/email",
        { email: "a@example.com", password: "x" },
        { origin: BASE_URL, ip: "198.51.100.20" },
      );
    }
    const other = await request(
      auth,
      "/sign-in/email",
      { email: "a@example.com", password: "x" },
      { origin: BASE_URL, ip: "198.51.100.21" },
    );
    expect(other.status).toBe(401);
  });

  it("limits sign-up too, while normal sign-up still works", async () => {
    const auth = makeAuth();
    const ip = "198.51.100.30";
    const first = await request(auth, "/sign-up/email", signUpBody(100), { origin: BASE_URL, ip });
    expect(first.status).toBe(200);
    let last = first;
    for (let i = 1; i <= AUTH_RATE_LIMIT_RULE.max; i++) {
      last = await request(auth, "/sign-up/email", signUpBody(100 + i), { origin: BASE_URL, ip });
    }
    expect(last.status).toBe(429);
  });
});
