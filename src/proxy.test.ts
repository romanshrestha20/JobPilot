import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import proxy from "./proxy";

const ORIGIN = "http://localhost:3001";

function call(path: string, { signedIn = false } = {}) {
  const headers = signedIn ? { cookie: "better-auth.session_token=signed.value" } : undefined;
  return proxy(new NextRequest(`${ORIGIN}${path}`, { headers }));
}

function location(res: Response) {
  const value = res.headers.get("location");
  return value ? new URL(value) : null;
}

describe("proxy redirects", () => {
  it("sends an unauthenticated visitor to sign-in, preserving the destination", async () => {
    const res = await call("/profile?tab=cv");
    expect(res.status).toBe(307);
    const to = location(res)!;
    expect(to.origin).toBe(ORIGIN);
    expect(to.pathname).toBe("/sign-in");
    expect(to.searchParams.get("next")).toBe("/profile?tab=cv");
  });

  it("lets an unauthenticated visitor reach the auth pages and the auth API", async () => {
    for (const path of [
      "/sign-in",
      "/sign-up",
      "/sign-in?next=/profile",
      "/api/auth/get-session",
    ]) {
      const res = await call(path);
      expect(res.headers.get("location"), path).toBeNull();
    }
  });

  it("sends a signed-in user from an auth page to a validated next, else home", async () => {
    expect(location(await call("/sign-in?next=%2Fprofile", { signedIn: true }))!.pathname).toBe(
      "/profile",
    );
    expect(location(await call("/sign-in", { signedIn: true }))!.pathname).toBe("/");
    for (const bad of [
      "//evil.example",
      "https://evil.example",
      "/\\evil.example",
      "/sign-in",
      "javascript:alert(1)",
    ]) {
      const to = location(
        await call(`/sign-up?next=${encodeURIComponent(bad)}`, { signedIn: true }),
      )!;
      expect(to.origin, bad).toBe(ORIGIN);
      expect(to.pathname, bad).toBe("/");
    }
  });

  it("matches the auth pages by path segment, not by prefix", async () => {
    // `/sign-instructions` must be treated as a protected page, not as the public `/sign-in`.
    const res = await call("/sign-instructions");
    expect(location(res)!.pathname).toBe("/sign-in");
    expect(
      (await call("/sign-instructions", { signedIn: true })).headers.get("location"),
    ).toBeNull();
  });

  it("does not redirect a signed-in user on protected pages", async () => {
    expect((await call("/profile", { signedIn: true })).headers.get("location")).toBeNull();
  });
});
