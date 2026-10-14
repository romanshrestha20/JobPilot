import { auth, type User } from "@/lib/auth";

export class UnauthenticatedError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "UnauthenticatedError";
  }
}

// Also used for records owned by someone else, so callers cannot probe which ids exist.
export class NotFoundError extends Error {
  constructor() {
    super("Not found");
    this.name = "NotFoundError";
  }
}

/** Validates the session against the database via Better Auth; returns null when signed out. */
export async function getSessionUser(headers: Headers): Promise<User | null> {
  const session = await auth.api.getSession({ headers });
  return session?.user ?? null;
}

export async function requireUserFromHeaders(headers: Headers): Promise<User> {
  const user = await getSessionUser(headers);
  if (!user) throw new UnauthenticatedError();
  return user;
}

/**
 * Ownership guard for an already-loaded record. Prefer scoping the query itself
 * (`WHERE id = ? AND user_id = ?`); use this when a record is loaded by id first.
 */
export function assertOwned<T extends { userId: string }>(
  record: T | null | undefined,
  user: Pick<User, "id">,
): T {
  if (!record || record.userId !== user.id) throw new NotFoundError();
  return record;
}
