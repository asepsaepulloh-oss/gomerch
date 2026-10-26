import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/server/db/pg-client";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  SESSION_COOKIE_NAME,
} from "@/server/auth/session";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email dan password wajib diisi." },
        { status: 400 }
      );
    }

    const user = await queryOne(
      "SELECT id, email, password_hash, display_name FROM public.users WHERE email = $1",
      [email.trim().toLowerCase()]
    );

    if (!user || !verifyPassword(password, user.password_hash)) {
      return NextResponse.json(
        { success: false, error: "Email atau password salah." },
        { status: 401 }
      );
    }

    const token = createSessionToken({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
    });

    const response = NextResponse.json({
      success: true,
      message: "Login berhasil.",
      user: { id: user.id, email: user.email, displayName: user.display_name },
    });

    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Terjadi kesalahan internal saat login." },
      { status: 500 }
    );
  }
}
