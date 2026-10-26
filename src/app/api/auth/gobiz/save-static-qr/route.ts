import { NextRequest, NextResponse } from "next/server";
import { getDashboardSessionUser } from "@/server/auth/session";
import { db } from "@/server/db/unified-db";

export async function POST(req: NextRequest) {
  try {
    const user = await getDashboardSessionUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const staticQrString = body.static_qr_string?.trim();

    if (!staticQrString) {
      return NextResponse.json(
        { success: false, error: "String QRIS Statis GoBiz wajib diisi." },
        { status: 400 }
      );
    }

    if (!staticQrString.startsWith("000201")) {
      return NextResponse.json(
        {
          success: false,
          error: "Format string QRIS tidak valid. Standar QRIS EMVCo harus diawali dengan '000201'.",
        },
        { status: 400 }
      );
    }

    const connection = await db.connections.upsert({
      owner_id: user.id,
      static_qr_string: staticQrString,
    });

    return NextResponse.json({
      success: true,
      message: "String QRIS Statis GoBiz berhasil disimpan. Generator pembayaran kini otomatis menerbitkan QRIS Dinamis berdasarkan template outlet Anda!",
      data: {
        static_qr_string: connection.static_qr_string,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
