// Pure configuration helpers for src/lib/auth.ts, kept separate so they can be unit tested.

/** Sign-in and sign-up are the credential-guessing surface: tighter than the 100 req / 10 s default. */
export const AUTH_RATE_LIMIT_RULE = { window: 60, max: 5 } as const;

export const authRateLimit = {
  // Explicit: better-auth only enables rate limiting in production by default.
  enabled: true,
  window: 10,
  max: 100,
  // In-process memory: correct for one server instance. Counters reset on restart and are not
  // shared across instances; move to a database or secondary storage before scaling out.
  storage: "memory",
  customRules: {
    "/sign-in/email": AUTH_RATE_LIMIT_RULE,
    "/sign-up/email": AUTH_RATE_LIMIT_RULE,
  },
} as const;

/**
 * Origin and CSRF validation must never be switched off. Better Auth skips the origin check by
 * default when it detects a test runtime, so this is stated explicitly rather than left to defaults.
 */
export const authAdvanced = {
  disableOriginCheck: false,
  disableCSRFCheck: false,
} as const;

/** Reduces a URL to its origin (`scheme://host[:port]`), or null if it is not a plain http(s) origin. */
function toOrigin(value: string): string | null {
  if (value.includes("*")) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // Reject anything that is not just an origin (paths, credentials, wildcards would widen trust).
  if (url.username || url.password) return null;
  if (url.pathname !== "/" || url.search || url.hash) return null;
  return url.origin;
}

/**
 * Origins allowed to make state-changing auth requests: the app's own base URL plus any
 * explicitly listed extras (comma-separated). Invalid entries throw so a typo cannot
 * silently widen or narrow trust.
 */
export function resolveTrustedOrigins(baseUrl: string, extra?: string): string[] {
  let base: string;
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("protocol");
    base = url.origin;
  } catch {
    throw new Error("BETTER_AUTH_URL must be an http(s) URL");
  }

  const origins = new Set<string>([base]);
  for (const entry of (extra ?? "").split(",")) {
    if (!entry.trim()) continue;
    const origin = toOrigin(entry);
    if (!origin) throw new Error("BETTER_AUTH_TRUSTED_ORIGINS contains an invalid origin");
    origins.add(origin);
  }
  return [...origins];
}
