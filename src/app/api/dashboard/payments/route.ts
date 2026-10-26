import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDashboardSessionUser } from "@/server/auth/session";
import { getQrisProvider } from "@/server/providers/qris/providers";
import { db } from "@/server/db/unified-db";
import { encryptToken } from "@/server/security/token-encryption";
import { dispatchWebhookEvent } from "@/server/services/webhook-service";

const CreatePaymentSchema = z.object({
  external_id: z.string().min(1, "external_id wajib diisi").max(64),
  amount: z.number().int().positive("amount harus berupa angka positif"),
  currency: z.literal("IDR").default("IDR"),
  description: z.string().max(255).optional(),
  expires_in_seconds: z.number().int().min(60).max(86400).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getDashboardSessionUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status") || undefined;
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
    const offset = (page - 1) * limit;

    const { orders, total } = await db.orders.listByOwner(user.id, {
      status,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      data: orders.map(o => ({
        payment_id: o.id,
        external_id: o.external_id,
        amount: o.amount,
        currency: o.currency,
        status: o.status,
        description: o.description,
        created_at: o.created_at,
        paid_at: o.paid_at,
        expires_at: o.payment_window_end,
      })),
      pagination: {
        page,
        limit,
        total,
      },
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

    const rawBody = await req.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json(
        { success: false, error: { message: "Request body harus berupa JSON." } },
        { status: 400 }
      );
    }

    const parsed = CreatePaymentSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { message: parsed.error.issues.map(i => i.message).join(", ") } },
        { status: 422 }
      );
    }

    const input = parsed.data;

    // Check if external_id already exists
    const existingOrder = await db.orders.getByExternalId(input.external_id, user.id);
    if (existingOrder) {
      return NextResponse.json(
        { success: false, error: { message: `Order dengan external_id '${input.external_id}' sudah ada.` } },
        { status: 409 }
      );
    }

    // Resolve merchant info & static QR template if configured
    const connection = await db.connections.getByOwnerId(user.id);
    const provider = getQrisProvider();

    // Create QRIS payment
    const providerPayment = await provider.createPayment({
      externalId: input.external_id,
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      merchantId: connection?.merchant_id || "GBZ-MCH-001",
      merchantName: connection?.merchant_name || "Merchant Gateway",
      staticQR: connection?.static_qr_string || undefined,
      expiresInSeconds: input.expires_in_seconds || 900,
    });

    const qrPayloadEnc = encryptToken(
      JSON.stringify(providerPayment.rawPayload || { qr: providerPayment.qrString })
    );

    const order = await db.orders.create({
      owner_id: user.id,
      connection_id: connection?.id || null,
      provider_payment_id: providerPayment.providerPaymentId,
      external_id: input.external_id,
      amount: input.amount,
      currency: input.currency,
      description: input.description || null,
      status: "PENDING",
      qr_string: providerPayment.qrString,
      qr_payload_enc: qrPayloadEnc,
      payment_window_start: new Date().toISOString(),
      payment_window_end: providerPayment.expiresAt,
      matched_transaction_id: null,
      paid_at: null,
    });

    dispatchWebhookEvent({
      ownerId: user.id,
      eventType: "payment.created",
      resourceId: order.id,
      data: {
        payment_id: order.id,
        external_id: order.external_id,
        amount: order.amount,
        currency: order.currency,
        status: order.status,
        expires_at: providerPayment.expiresAt,
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        payment_id: order.id,
        external_id: order.external_id,
        amount: order.amount,
        currency: order.currency,
        payment_method: "QRIS",
        status: order.status,
        qr_string: providerPayment.qrString,
        qr_image_url: providerPayment.qrImageUrl || null,
        expires_at: providerPayment.expiresAt,
      },
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: { message: err.message || "Gagal membuat tagihan QRIS." } },
      { status: 500 }
    );
  }
}
