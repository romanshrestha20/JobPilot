// Pure helpers (no server-only imports) so the proxy, client pages and tests share one rule.

const PLACEHOLDER_ORIGIN = "http://redirect.invalid";
const MAX_NEXT_LENGTH = 512;
// Never send a user back to an auth screen (redirect loop) or a raw API endpoint.
const BLOCKED_PREFIXES = ["/sign-in", "/sign-up", "/api"];
// ASCII control characters and DEL; browsers strip some of them, which can turn `/\t/evil.com` into `//evil.com`.
// eslint-disable-next-line no-control-regex -- matching control characters is the purpose of this check.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Returns a same-origin, relative path that is safe to redirect to after sign-in,
 * or `fallback` for anything else (absolute URLs, `//host`, backslashes, `javascript:`,
 * control characters, auth/API paths, oversized values, non-strings).
 *
 * The result is rebuilt from the parsed URL, never the raw input.
 */
export function safeNextPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_NEXT_LENGTH) {
    return fallback;
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (CONTROL_CHARS.test(value)) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(value, PLACEHOLDER_ORIGIN);
  } catch {
    return fallback;
  }
  if (parsed.origin !== PLACEHOLDER_ORIGIN) return fallback;
  if (BLOCKED_PREFIXES.some((prefix) => matchesPrefix(parsed.pathname, prefix))) return fallback;

  // Dot segments are normalized away (`/.//evil.example` → `//evil.example`), which would turn the
  // rebuilt string into a protocol-relative URL. Re-check the rebuilt value, not just the input.
  if (parsed.pathname.startsWith("//")) return fallback;

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/** Builds `/sign-in?next=…` for a protected path, or plain `/sign-in` when the path is not a safe target. */
export function signInUrlFor(pathWithSearch: string): string {
  const next = safeNextPath(pathWithSearch, "");
  return next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in";
}

/** Keeps a sanitized `next` when linking between the sign-in and sign-up screens. */
export function withNext(path: "/sign-in" | "/sign-up", next: string): string {
  return next === "/" ? path : `${path}?next=${encodeURIComponent(next)}`;
}
