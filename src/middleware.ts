import { NextResponse, type NextRequest } from "next/server";

export const SESSION_COOKIE_NAME = "qris_session_token";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (path.startsWith("/api/v1") || path.startsWith("/api/cron")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isAuthPage = path === "/login" || path === "/register" || path === "/forgot-password";
  const isDashboardPage = path.startsWith("/dashboard");

  // If user visits /dashboard without session cookie, redirect to login
  if (isDashboardPage && !token) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  // If user already logged in and visits login/register, redirect to dashboard
  if (isAuthPage && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
