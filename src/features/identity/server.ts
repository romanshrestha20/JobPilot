import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@/lib/auth";
import { UnauthenticatedError, requireUserFromHeaders } from "@/lib/authz";

/**
 * For Server Components, layouts and server actions: returns the signed-in user or
 * redirects to /sign-in. Reads request headers, so with Cache Components the caller
 * must render inside a <Suspense> boundary. Route handlers use `withUser` instead.
 */
export async function requireUser(): Promise<User> {
  try {
    return await requireUserFromHeaders(await headers());
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/sign-in");
    throw error;
  }
}
