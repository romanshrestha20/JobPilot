import type { User } from "@/lib/auth";
import { NotFoundError, UnauthenticatedError, requireUserFromHeaders } from "@/lib/authz";

type ErrorCode = "UNAUTHENTICATED" | "NOT_FOUND";

function errorResponse(status: number, code: ErrorCode, message: string): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Wraps a route handler so it only runs for a signed-in user.
 * Signed out → 401, missing or not-owned record (NotFoundError) → 404.
 * Any other error is rethrown so internals never reach the client body.
 */
export function withUser<Ctx = unknown>(
  handler: (request: Request, user: User, ctx: Ctx) => Promise<Response>,
): (request: Request, ctx: Ctx) => Promise<Response> {
  return async (request, ctx) => {
    try {
      const user = await requireUserFromHeaders(request.headers);
      return await handler(request, user, ctx);
    } catch (error) {
      if (error instanceof UnauthenticatedError) {
        return errorResponse(401, "UNAUTHENTICATED", "Authentication required");
      }
      if (error instanceof NotFoundError) {
        return errorResponse(404, "NOT_FOUND", "Not found");
      }
      throw error;
    }
  };
}
