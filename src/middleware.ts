import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Let API v1 and Cron routes pass directly to their own token handlers
  if (path.startsWith("/api/v1") || path.startsWith("/api/cron")) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase credentials are dummy/unconfigured, allow local sandbox demo mode
  if (!supabaseUrl || !anonKey || supabaseUrl.includes("dummy-project")) {
    return response;
  }

  try {
    const supabase = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();

    // Route Protection
    const isAuthPage = path === "/login" || path === "/register" || path === "/forgot-password";
    const isDashboardPage = path.startsWith("/dashboard");

    if (isDashboardPage && !user) {
      const redirectUrl = new URL("/login", request.url);
      redirectUrl.searchParams.set("next", path);
      return NextResponse.redirect(redirectUrl);
    }

    if (isAuthPage && user) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  } catch {
    // If Supabase request errors, fail safely
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
