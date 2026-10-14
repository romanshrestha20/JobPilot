import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { safeNextPath, signInUrlFor } from "@/lib/safe-redirect";

const PUBLIC_PATHS = ["/sign-in", "/sign-up"];
const AUTH_API_PREFIX = "/api/auth";

// Optimistic check only — reads the session cookie without a DB call.
// Real authorization is enforced at the data layer (DAL).
export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always pass auth API routes through
  if (pathname.startsWith(AUTH_API_PREFIX)) {
    return NextResponse.next();
  }

  // Handles the __Secure- cookie prefix used over HTTPS.
  const isAuthenticated = !!getSessionCookie(request);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Signed-in user hitting auth pages → send home
  if (isAuthenticated && isPublic) {
    // Honor a validated ?next= so a deep link survives a visit to /sign-in while signed in.
    const next = safeNextPath(request.nextUrl.searchParams.get("next"));
    return NextResponse.redirect(new URL(next, request.url));
  }

  // Unauthenticated user hitting protected pages → send to sign-in
  if (!isAuthenticated && !isPublic) {
    return NextResponse.redirect(
      new URL(signInUrlFor(pathname + request.nextUrl.search), request.url),
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
