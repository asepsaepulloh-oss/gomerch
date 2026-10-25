import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/server/security/api-keys";
import { db } from "@/server/db/unified-db";
import { getQrisProvider } from "@/server/providers/qris/providers";
import { dispatchWebhookEvent } from "@/server/services/webhook-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
    const { id: paymentId } = await params;

    const order = await db.orders.getById(paymentId, ownerId);
    if (!order) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: `Pembayaran dengan ID '${paymentId}' tidak ditemukan.`,
          },
        },
        { status: 404 }
      );
    }

    if (order.status === "PAID") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CANNOT_CANCEL_PAID",
            message: "Pembayaran yang sudah berhasil (PAID) tidak dapat dibatalkan.",
          },
        },
        { status: 409 }
      );
    }

    if (order.status === "CANCELLED") {
      return NextResponse.json({
        success: true,
        data: {
          payment_id: order.id,
          external_id: order.external_id,
          status: "CANCELLED",
        },
      });
    }

    // Call provider cancel if provider payment ID exists
    const provider = getQrisProvider(environment === "sandbox");
    if (order.provider_payment_id && provider.cancelPayment) {
      try {
        await provider.cancelPayment(order.provider_payment_id);
      } catch (err: any) {
        // Provider might not support cancel or already expired
      }
    }

    const updated = await db.orders.updateStatus(order.id, {
      status: "CANCELLED",
    });

    dispatchWebhookEvent({
      ownerId,
      eventType: "payment.cancelled",
      resourceId: updated.id,
      data: {
        payment_id: updated.id,
        external_id: updated.external_id,
        amount: updated.amount,
        status: "CANCELLED",
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        payment_id: updated.id,
        external_id: updated.external_id,
        status: "CANCELLED",
        updated_at: updated.updated_at,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: err.message || "Terjadi kesalahan pada server.",
        },
      },
      { status: 500 }
    );
  }
}
