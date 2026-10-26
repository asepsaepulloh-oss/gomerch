import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/server/auth/session";

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const response = NextResponse.redirect(`${origin}/login`, { status: 302 });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
