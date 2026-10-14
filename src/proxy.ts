import { NextRequest, NextResponse } from "next/server";

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

  const sessionCookie = request.cookies.get("better-auth.session_token");
  const isAuthenticated = !!sessionCookie?.value;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // Signed-in user hitting auth pages → send home
  if (isAuthenticated && isPublic) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Unauthenticated user hitting protected pages → send to sign-in
  if (!isAuthenticated && !isPublic) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("next", pathname);
    return NextResponse.redirect(signIn);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
