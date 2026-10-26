import { NextRequest, NextResponse } from "next/server";
import { getDashboardSessionUser } from "@/server/auth/session";
import { GobizAdapter } from "@/server/providers/gobiz/adapter";
import { normalizeIndonesianPhone } from "@/server/utils/phone-normalizer";
import { encryptToken } from "@/server/security/token-encryption";
import { db } from "@/server/db/unified-db";

export async function GET(req: NextRequest) {
  try {
    const user = await getDashboardSessionUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const connection = await db.connections.getByOwnerId(user.id);
    return NextResponse.json({
      success: true,
      data: connection
        ? {
            id: connection.id,
            status: connection.status,
            merchant_id: connection.merchant_id,
            merchant_name: connection.merchant_name,
            phone_masked: connection.phone_masked,
            token_expires_at: connection.token_expires_at,
            connected_at: connection.updated_at,
          }
        : null,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

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
    const otp = body.otp;
    const otpToken = body.otp_token;

    if (!rawPhone || !otp) {
      return NextResponse.json(
        { success: false, error: "Nomor handphone dan kode OTP wajib diisi." },
        { status: 400 }
      );
    }

    const normalized = normalizeIndonesianPhone(rawPhone);
    const adapter = new GobizAdapter();

    // 1. Verify OTP with GoBiz
    const tokenResult = await adapter.verifyOtp({
      phone_number: normalized.phone_number,
      otp,
      otpToken,
    });

    // 2. Encrypt tokens using AES-256-GCM
    const accessTokenEnc = encryptToken(tokenResult.accessToken);
    const refreshTokenEnc = tokenResult.refreshToken ? encryptToken(tokenResult.refreshToken) : null;
    const tokenExpiresAt = new Date(Date.now() + (tokenResult.expiresIn || 86400) * 1000).toISOString();

    // 3. Resolve Merchant Identity
    let merchantInfo: { merchantId: string; merchantName: string } = {
      merchantId: "GBZ-MCH-001",
      merchantName: "Merchant GoBiz",
    };

    try {
      const resolved = await adapter.resolveMerchant(tokenResult.accessToken);
      merchantInfo = {
        merchantId: resolved.merchantId,
        merchantName: resolved.merchantName,
      };
    } catch {
      // Fallback if merchant search has delayed indexing
      merchantInfo = {
        merchantId: `GBZ-${normalized.phone_number.slice(-6)}`,
        merchantName: `Outlet GoBiz (+62${normalized.phone_number})`,
      };
    }

    // 4. Save connection record in database
    const connection = await db.connections.upsert({
      owner_id: user.id,
      provider: "gobiz",
      merchant_id: merchantInfo.merchantId,
      merchant_name: merchantInfo.merchantName,
      country_code: normalized.country_code,
      phone_masked: normalized.phone_masked,
      access_token_enc: accessTokenEnc,
      refresh_token_enc: refreshTokenEnc,
      token_expires_at: tokenExpiresAt,
      status: "CONNECTED",
      last_sync_at: new Date().toISOString(),
      last_error_code: null,
    });

    // 5. Audit log
    await db.audit.log("CONNECT_GOBIZ_OTP", user.id, {
      merchantId: merchantInfo.merchantId,
      phoneMasked: normalized.phone_masked,
    });

    // 6. Return success to UI - NEVER return plaintext tokens!
    return NextResponse.json({
      success: true,
      data: {
        id: connection.id,
        status: connection.status,
        merchant_id: connection.merchant_id,
        merchant_name: connection.merchant_name,
        phone_masked: connection.phone_masked,
        token_expires_at: connection.token_expires_at,
        connected_at: connection.updated_at,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Verifikasi OTP gagal." },
      { status: 400 }
    );
  }
}
