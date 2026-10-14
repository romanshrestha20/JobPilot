import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { jobPosting } from "@/features/job-intake/schema";
import { user as userTable } from "@/lib/schema";
import { connectTestDatabase } from "@/test/integration-db";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

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

/** Signs in through the API on the page's own context, so the browser holds the session cookie. */
export async function signInViaApi(page: Page, user: TestUser, origin: string) {
  const res = await page.request.post("/api/auth/sign-in/email", {
    data: { email: user.email, password: user.password },
    headers: { origin },
  });
  expect(res.ok()).toBe(true);
}

export interface SeedJob {
  title: string;
  status?: string;
  /** Minutes before now, so list order is deterministic (smaller = newer). */
  minutesAgo?: number;
}

/**
 * Inserts jobs straight into the guarded test database for a registered test user, so list,
 * filter and pagination tests do not have to create dozens of jobs through the form.
 */
export async function seedJobs(email: string, jobs: SeedJob[]) {
  const { db, close } = await connectTestDatabase();
  try {
    const [owner] = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, email));
    if (!owner) throw new Error("seedJobs: test user not found");
    const now = Date.now();
    await db.insert(jobPosting).values(
      jobs.map((job, index) => ({
        userId: owner.id,
        title: job.title,
        company: "Seed Co",
        description: "Seeded job.",
        status: job.status ?? "saved",
        createdAt: new Date(now - (job.minutesAgo ?? index) * 60_000),
      })),
    );
  } finally {
    await close();
  }
}

/** Reads a job's stored status straight from the test database (null when it does not exist). */
export async function storedJobStatus(jobId: string): Promise<string | null> {
  const { db, close } = await connectTestDatabase();
  try {
    const [row] = await db
      .select({ status: jobPosting.status })
      .from(jobPosting)
      .where(eq(jobPosting.id, jobId));
    return row?.status ?? null;
  } finally {
    await close();
  }
}
