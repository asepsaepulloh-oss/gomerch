import { NextRequest, NextResponse } from "next/server";
import { getDashboardSessionUser } from "@/server/auth/session";
import { db } from "@/server/db/unified-db";
import { syncMerchantTransactions } from "@/server/services/sync-worker";

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
    if (!connection || connection.status !== "CONNECTED") {
      return NextResponse.json(
        { success: false, error: "Koneksi GoBiz belum terhubung atau tidak aktif." },
        { status: 400 }
      );
    }

    const result = await syncMerchantTransactions(connection);

    return NextResponse.json({
      success: result.success,
      data: result,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Sinkronisasi gagal." },
      { status: 500 }
    );
  }
}
