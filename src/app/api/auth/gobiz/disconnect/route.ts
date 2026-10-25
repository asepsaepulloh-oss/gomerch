import { NextRequest, NextResponse } from "next/server";
import { getDashboardSessionUser } from "@/server/auth/session";
import { db } from "@/server/db/unified-db";

export async function POST(req: NextRequest) {
  try {
    const user = await getDashboardSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const connection = await db.connections.getByOwnerId(user.id);
    if (!connection) {
      return NextResponse.json(
        { success: false, error: "Tidak ada koneksi GoBiz aktif untuk akun ini." },
        { status: 404 }
      );
    }

    // Wipe tokens and reset connection status
    await db.connections.upsert({
      owner_id: user.id,
      id: connection.id,
      status: "NOT_CONNECTED",
      access_token_enc: null,
      refresh_token_enc: null,
      token_expires_at: null,
      merchant_id: null,
      merchant_name: null,
      phone_masked: null,
    });

    await db.audit.log("DISCONNECT_GOBIZ", user.id, { connectionId: connection.id });

    return NextResponse.json({
      success: true,
      message: "Koneksi GoBiz berhasil diputuskan.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Gagal memutuskan koneksi." },
      { status: 500 }
    );
  }
}
