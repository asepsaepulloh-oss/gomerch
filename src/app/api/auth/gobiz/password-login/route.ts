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
    const email = body.email;
    const password = body.password;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email dan password GoBiz wajib diisi." },
        { status: 400 }
      );
    }

    const adapter = new GobizAdapter();

    // Authenticate with GoBiz credentials
    let tokenResult;
    try {
      tokenResult = await adapter.loginWithPassword(email, password);
    } catch (authErr: any) {
      const msg = authErr.message || "";
      // Provide clear guidance if GoBiz security blocks password login
      if (
        msg.includes("Kamu tidak dapat melakukan log in") ||
        msg.includes("tidak dapat melakukan") ||
        msg.includes("blocked")
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "GoBiz membatasi login Password untuk akun ini (kebijakan keamanan GoBiz mengharuskan autentikasi 2FA). Silakan gunakan tab 'Nomor HP + OTP' di atas untuk masuk langsung dengan kode SMS/WhatsApp.",
          },
          { status: 400 }
        );
      }
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }

    // Encrypt tokens via AES-256-GCM
    const accessTokenEnc = encryptToken(tokenResult.accessToken);
    const refreshTokenEnc = tokenResult.refreshToken ? encryptToken(tokenResult.refreshToken) : null;
    const tokenExpiresAt = new Date(Date.now() + (tokenResult.expiresIn || 86400) * 1000).toISOString();

    // Resolve Merchant Profile
    let merchantInfo = {
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
      merchantInfo = {
        merchantId: `GBZ-${email.split("@")[0].toUpperCase()}`,
        merchantName: `GoBiz Outlet (${email})`,
      };
    }

    // Masked representation of email for privacy
    const emailParts = email.split("@");
    const maskedEmail = `${emailParts[0].slice(0, 3)}***@${emailParts[1] || "gobiz.co.id"}`;

    // Save connection state in PostgreSQL
    const connection = await db.connections.upsert({
      owner_id: user.id,
      provider: "gobiz",
      merchant_id: merchantInfo.merchantId,
      merchant_name: merchantInfo.merchantName,
      phone_masked: maskedEmail,
      access_token_enc: accessTokenEnc,
      refresh_token_enc: refreshTokenEnc,
      token_expires_at: tokenExpiresAt,
      status: "CONNECTED",
      last_sync_at: new Date().toISOString(),
      last_error_code: null,
    });

    // Audit log
    await db.audit.log("CONNECT_GOBIZ_PASSWORD", user.id, {
      merchantId: merchantInfo.merchantId,
      emailMasked: maskedEmail,
    });

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
      { success: false, error: err.message || "Login GoBiz gagal." },
      { status: 400 }
    );
  }
}
