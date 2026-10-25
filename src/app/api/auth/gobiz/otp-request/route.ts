import { NextRequest, NextResponse } from "next/server";
import { getDashboardSessionUser } from "@/server/auth/session";
import { GobizAdapter } from "@/server/providers/gobiz/adapter";
import { normalizeIndonesianPhone } from "@/server/utils/phone-normalizer";
import { db } from "@/server/db/unified-db";

export async function POST(req: NextRequest) {
  try {
    const user = await getDashboardSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Silakan login ke dashboard terlebih dahulu." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawPhone = body.phone_number;

    if (!rawPhone) {
      return NextResponse.json(
        { success: false, error: "Nomor handphone wajib diisi." },
        { status: 400 }
      );
    }

    const normalized = normalizeIndonesianPhone(rawPhone);
    const adapter = new GobizAdapter();
    const result = await adapter.requestOtp(normalized.phone_number);

    // Save temporary OTP_PENDING connection state
    await db.connections.upsert({
      owner_id: user.id,
      country_code: normalized.country_code,
      phone_masked: normalized.phone_masked,
      status: "OTP_PENDING",
      provider: "gobiz",
    });

    return NextResponse.json({
      success: true,
      message: result.message,
      phone_masked: normalized.phone_masked,
      expires_in_seconds: result.expiresInSeconds,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Gagal meminta OTP GoBiz." },
      { status: 400 }
    );
  }
}
