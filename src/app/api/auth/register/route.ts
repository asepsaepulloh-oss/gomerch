import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/server/db/pg-client";
import {
  hashPassword,
  createSessionToken,
  SESSION_COOKIE_NAME,
} from "@/server/auth/session";

export async function POST(req: NextRequest) {
  try {
    const { email, password, fullName } = await req.json();

    if (!email || !password || !fullName) {
      return NextResponse.json(
        { success: false, error: "Semua field wajib diisi." },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await queryOne(
      "SELECT id FROM public.users WHERE email = $1",
      [cleanEmail]
    );

    if (existing) {
      return NextResponse.json(
        { success: false, error: "Alamat email sudah terdaftar." },
        { status: 409 }
      );
    }

    const passwordHash = hashPassword(password);
    const newUser = await queryOne(
      `INSERT INTO public.users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name`,
      [cleanEmail, passwordHash, fullName.trim()]
    );

    const token = createSessionToken({
      id: newUser.id,
      email: newUser.email,
      displayName: newUser.display_name,
    });

    const response = NextResponse.json({
      success: true,
      message: "Registrasi berhasil.",
      user: { id: newUser.id, email: newUser.email, displayName: newUser.display_name },
    });

    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Gagal mendaftarkan akun." },
      { status: 500 }
    );
  }
}
