import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateApiKey } from "@/server/security/api-keys";
import {
  computePayloadFingerprint,
  checkIdempotency,
  registerIdempotencyKey,
  completeIdempotencyKey,
} from "@/server/security/idempotency";
import { getQrisProvider } from "@/server/providers/qris/providers";
import { db } from "@/server/db/unified-db";
import { encryptToken } from "@/server/security/token-encryption";
import { dispatchWebhookEvent } from "@/server/services/webhook-service";

const CreateQrisSchema = z.object({
  external_id: z.string().min(1, "external_id wajib diisi").max(64),
  amount: z.number().int().positive("amount harus berupa angka positif lebih dari 0"),
  currency: z.literal("IDR").default("IDR"),
  description: z.string().max(255).optional(),
  expires_in_seconds: z.number().int().min(60).max(86400).optional(),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate API Key
    const authHeader = req.headers.get("authorization");
    const authResult = await validateApiKey(authHeader);

    if (!authResult.isValid || !authResult.keyRecord) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: authResult.error || "Autentikasi gagal.",
          },
        },
        { status: 401 }
      );
    }

    const { owner_id: ownerId, environment } = authResult.keyRecord;

    // 2. Idempotency Key Validation
    const idempotencyKey = req.headers.get("idempotency-key");
    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "MISSING_IDEMPOTENCY_KEY",
            message: "Header 'Idempotency-Key' wajib disertakan untuk mencegah duplikasi tagihan.",
          },
        },
        { status: 400 }
      );
    }

    const rawBody = await req.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_REQUEST",
            message: "Request body harus berupa JSON yang valid.",
          },
        },
        { status: 400 }
      );
    }

    // 3. Validate Request Payload
    const parsed = CreateQrisSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(", "),
          },
        },
        { status: 422 }
      );
    }

    const input = parsed.data;
    const fingerprint = computePayloadFingerprint(input);

    // 4. Check Idempotency Record
    const idempotencyCheck = await checkIdempotency({
      ownerId,
      idempotencyKey,
      fingerprint,
    });

    if (idempotencyCheck.isDuplicate) {
      if (idempotencyCheck.mismatchedPayload) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "IDEMPOTENCY_MISMATCH",
              message: "Idempotency-Key telah digunakan dengan payload yang berbeda.",
            },
          },
          { status: 409 }
        );
      }

      if (idempotencyCheck.isProcessing) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "CONCURRENT_REQUEST",
              message: "Permintaan dengan kunci idempotensi ini sedang diproses.",
            },
          },
          { status: 409 }
        );
      }

      if (idempotencyCheck.cachedResponse) {
        return NextResponse.json(
          idempotencyCheck.cachedResponse.body,
          { status: idempotencyCheck.cachedResponse.statusCode }
        );
      }
    }

    // Register idempotency lock
    await registerIdempotencyKey({
      ownerId,
      idempotencyKey,
      fingerprint,
    });

    // 5. Check if external_id already exists for this owner
    const existingOrder = await db.orders.getByExternalId(input.external_id, ownerId);
    if (existingOrder) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "DUPLICATE_EXTERNAL_ID",
            message: `Order dengan external_id '${input.external_id}' sudah ada sebelumnya.`,
          },
        },
        { status: 409 }
      );
    }

    // 6. Resolve Merchant Connection
    const connection = await db.connections.getByOwnerId(ownerId);
    const isSandbox = environment === "sandbox";
    const provider = getQrisProvider(isSandbox);

    // 7. Request Dynamic QRIS from Provider
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

    // 8. Encrypt raw QR payload for storage
    const qrPayloadEnc = encryptToken(
      JSON.stringify(providerPayment.rawPayload || { qr: providerPayment.qrString })
    );

    // 9. Persist Order in Database
    const order = await db.orders.create({
      owner_id: ownerId,
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

    // 10. Dispatch Webhook Event `payment.created`
    dispatchWebhookEvent({
      ownerId,
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

    // 11. Format Response
    const responseData = {
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
    };

    // 12. Save Idempotency response
    await completeIdempotencyKey({
      ownerId,
      idempotencyKey,
      statusCode: 201,
      body: responseData,
      resourceId: order.id,
    });

    return NextResponse.json(responseData, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: err.message || "Terjadi kesalahan internal pada server.",
        },
      },
      { status: 500 }
    );
  }
}
