import { like } from "drizzle-orm";
import { user } from "@/lib/schema";
import { connectTestDatabase } from "@/test/integration-db";
import { E2E_EMAIL_PATTERN } from "./support";

// Removes the users these tests created (profiles and sessions cascade). Only touches the
// guarded test database, and only rows with the E2E email pattern.
export default async function globalTeardown() {
  const { db, close } = await connectTestDatabase();
  try {
    await db.delete(user).where(like(user.email, E2E_EMAIL_PATTERN));
  } finally {
    await close();
  }
}
