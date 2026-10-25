import { NextRequest, NextResponse } from "next/server";
import { getDashboardSessionUser } from "@/server/auth/session";
import { db } from "@/server/db/unified-db";
import { deliverEventToEndpoint } from "@/server/services/webhook-service";

export async function POST(req: NextRequest) {
  try {
    const user = await getDashboardSessionUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const endpointId = body.endpoint_id;

    if (!endpointId) {
      return NextResponse.json({ success: false, error: "endpoint_id is required" }, { status: 400 });
    }

    const endpoints = await db.webhooks.listEndpoints(user.id);
    const endpoint = endpoints.find(e => e.id === endpointId);

    if (!endpoint) {
      return NextResponse.json({ success: false, error: "Endpoint not found" }, { status: 404 });
    }

    const testEvent = await db.webhooks.createEvent({
      owner_id: user.id,
      event_type: "webhook.test_ping",
      resource_id: endpoint.id,
      payload: {
        id: `evt_test_${Date.now()}`,
        type: "webhook.test_ping",
        created_at: new Date().toISOString(),
        data: {
          message: "Ini adalah pengujian webhook dari QRIS Payment Gateway Platform.",
          endpoint_id: endpoint.id,
          target_url: endpoint.url,
        },
      },
    });

    await deliverEventToEndpoint(endpoint, testEvent);

    const deliveries = await db.webhooks.listDeliveries(endpoint.id, 1);
    const latest = deliveries[0];

    return NextResponse.json({
      success: true,
      message: "Test ping telah dikirim.",
      delivery: latest || null,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
