import { NextRequest, NextResponse } from "next/server";
import { getDashboardSessionUser } from "@/server/auth/session";
import { db } from "@/server/db/unified-db";
import { generateApiKey } from "@/server/security/api-keys";

export async function GET(req: NextRequest) {
  try {
    const user = await getDashboardSessionUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const keys = await db.apiKeys.listByOwner(user.id);
    return NextResponse.json({
      success: true,
      data: keys.map(k => ({
        id: k.id,
        name: k.name,
        key_prefix: k.key_prefix,
        environment: k.environment,
        permissions: k.permissions,
        created_at: k.created_at,
        last_used_at: k.last_used_at,
        revoked_at: k.revoked_at,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getDashboardSessionUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const name = body.name || "Default API Key";
    const environment = body.environment === "production" ? "production" : "sandbox";

    const { apiKey, record } = await generateApiKey({
      ownerId: user.id,
      name,
      environment,
      permissions: ["payments:read", "payments:write"],
    });

    return NextResponse.json({
      success: true,
      data: {
        id: record.id,
        name: record.name,
        key_prefix: record.key_prefix,
        environment: record.environment,
        api_key: apiKey, // ONLY RETURNED ONCE HERE!
        created_at: record.created_at,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getDashboardSessionUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const keyId = searchParams.get("id");

    if (!keyId) {
      return NextResponse.json({ success: false, error: "Parameter id wajib diisi." }, { status: 400 });
    }

    const revoked = await db.apiKeys.revoke(keyId, user.id);
    if (!revoked) {
      return NextResponse.json({ success: false, error: "Key tidak ditemukan atau gagal dicabut." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "API key berhasil dicabut.",
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
