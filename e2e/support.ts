import { randomBytes, randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";

/** All E2E users use this pattern so teardown can remove exactly them. */
export const E2E_EMAIL_PATTERN = "e2e-%@example.invalid";

export interface TestUser {
  name: string;
  email: string;
  password: string;
}

export function newTestUser(): TestUser {
  return {
    name: "E2E User",
    email: `e2e-${randomUUID()}@example.invalid`,
    password: `pw-${randomBytes(12).toString("hex")}`,
  };
}

/** A random address from the RFC 2544 benchmark range, so each test has its own rate-limit bucket. */
export function randomClientIp(): string {
  const [a, b, c] = randomBytes(3);
  return `198.18.${(a % 254) + 1}.${((b + c) % 254) + 1}`;
}

/**
 * Creates an account through the real HTTP API with a cookie jar of its own, so the
 * browser under test stays signed out.
 */
export async function createAccount(request: APIRequestContext, user: TestUser, origin: string) {
  const res = await request.post("/api/auth/sign-up/email", {
    data: user,
    headers: { origin },
  });
  if (!res.ok()) throw new Error(`Test account setup failed with HTTP ${res.status()}`);
}
