import { NextRequest, NextResponse } from "next/server";
import { getDashboardSessionUser } from "@/server/auth/session";
import { db } from "@/server/db/unified-db";
import { generateWebhookSecret, validateWebhookUrlSafety } from "@/server/services/webhook-service";

export async function GET(req: NextRequest) {
  try {
    const user = await getDashboardSessionUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const endpoints = await db.webhooks.listEndpoints(user.id);
    const deliveriesMap: Record<string, any[]> = {};

    for (const ep of endpoints) {
      deliveriesMap[ep.id] = await db.webhooks.listDeliveries(ep.id, 10);
    }

    return NextResponse.json({
      success: true,
      data: endpoints.map(ep => ({
        id: ep.id,
        url: ep.url,
        signing_secret_preview: ep.signing_secret_preview,
        enabled: ep.enabled,
        created_at: ep.created_at,
        deliveries: deliveriesMap[ep.id] || [],
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
    const url = body.url;

    if (!url) {
      return NextResponse.json({ success: false, error: "URL webhook wajib diisi." }, { status: 400 });
    }

    const safety = validateWebhookUrlSafety(url);
    if (!safety.isSafe) {
      return NextResponse.json({ success: false, error: safety.reason }, { status: 400 });
    }

    const { secret, preview, encrypted } = generateWebhookSecret();

    const record = await db.webhooks.createEndpoint({
      owner_id: user.id,
      url,
      signing_secret_enc: encrypted,
      signing_secret_preview: preview,
      enabled: true,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: record.id,
        url: record.url,
        signing_secret: secret, // DISPLAYED ONLY ONCE TO USER!
        signing_secret_preview: record.signing_secret_preview,
        enabled: record.enabled,
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
    const endpointId = searchParams.get("id");

    if (!endpointId) {
      return NextResponse.json({ success: false, error: "id parameter is required" }, { status: 400 });
    }

    await db.webhooks.deleteEndpoint(endpointId, user.id);

    return NextResponse.json({
      success: true,
      message: "Webhook endpoint deleted successfully.",
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
