import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { user } from "@/lib/schema";
import { TEST_DATABASE_NAME, assertSafeTestDatabaseUrl } from "./database-guard";

/**
 * Connects to the dedicated integration-test database and applies every migration.
 * The target must pass `assertSafeTestDatabaseUrl`: a local `*_test` database that is
 * not the app's DATABASE_URL, so these tests can never touch development or production.
 */
export async function connectTestDatabase() {
  const url = assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL, [process.env.DATABASE_URL]);

  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client);

  // Defense in depth: ask the server what it actually connected us to, in case the driver
  // interpreted the URL differently from the guard. Nothing is written before this passes.
  try {
    const [{ name }] = await client<{ name: string }[]>`select current_database() as name`;
    if (!TEST_DATABASE_NAME.test(name)) {
      throw new Error(`Connected to "${name}", which is not a *_test database. Aborting.`);
    }
    await migrate(db, { migrationsFolder: "./drizzle" });
  } catch (error) {
    await client.end();
    throw error;
  }
  return { db, close: () => client.end() };
}

export type TestDatabase = Awaited<ReturnType<typeof connectTestDatabase>>["db"];

/** Inserts a Better Auth user row directly; returns its id. Cascade deletes clean up its data. */
export async function createTestUser(db: TestDatabase, label: string) {
  const id = `test-${label}-${randomUUID()}`;
  const now = new Date();
  await db.insert(user).values({
    id,
    name: `Test ${label}`,
    email: `${id}@example.invalid`,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });
  return { id };
}
