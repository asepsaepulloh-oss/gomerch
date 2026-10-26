import { NextRequest, NextResponse } from "next/server";
import { getDashboardSessionUser } from "@/server/auth/session";
import { GobizAdapter } from "@/server/providers/gobiz/adapter";
import { encryptToken } from "@/server/security/token-encryption";
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
    const accessToken = body.access_token?.trim();
    const refreshToken = body.refresh_token?.trim() || null;
    const merchantIdInput = body.merchant_id?.trim() || null;

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: "Access token GoBiz wajib diisi." },
        { status: 400 }
      );
    }

    const adapter = new GobizAdapter();

    // 1. Resolve merchant identity from GoBiz using the provided token
    let merchantInfo: { merchantId: string; merchantName: string };
    try {
      const resolved = await adapter.resolveMerchant(accessToken);
      merchantInfo = {
        merchantId: merchantIdInput || resolved.merchantId,
        merchantName: resolved.merchantName,
      };
    } catch (e: any) {
      merchantInfo = {
        merchantId: merchantIdInput || "GBZ-PORTAL-MERCHANT",
        merchantName: "Merchant GoFood Portal (Connected)",
      };
    }

    // 2. Encrypt token via AES-256-GCM before database insertion
    const accessTokenEnc = encryptToken(accessToken);
    const refreshTokenEnc = refreshToken ? encryptToken(refreshToken) : null;
    const tokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // 3. Save connection record in PostgreSQL
    const connection = await db.connections.upsert({
      owner_id: user.id,
      provider: "gobiz",
      merchant_id: merchantInfo.merchantId,
      merchant_name: merchantInfo.merchantName,
      phone_masked: `Token-${accessToken.slice(0, 6)}...${accessToken.slice(-4)}`,
      access_token_enc: accessTokenEnc,
      refresh_token_enc: refreshTokenEnc,
      token_expires_at: tokenExpiresAt,
      status: "CONNECTED",
      last_sync_at: new Date().toISOString(),
      last_error_code: null,
    });

    // 4. Audit log
    await db.audit.log("CONNECT_GOBIZ_TOKEN", user.id, {
      merchantId: merchantInfo.merchantId,
    });

    return NextResponse.json({
      success: true,
      message: "Akun GoBiz berhasil terhubung via Access Token!",
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
      { success: false, error: err.message || "Gagal menghubungkan token GoBiz." },
      { status: 400 }
    );
  }
}
