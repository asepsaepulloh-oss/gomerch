import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/server/security/api-keys";
import { db } from "@/server/db/unified-db";

export async function GET(
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

    const { owner_id: ownerId } = authResult.keyRecord;
    const { id: paymentId } = await params;

    const order = await db.orders.getById(paymentId, ownerId);
    if (!order) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: `Pembayaran dengan ID '${paymentId}' tidak ditemukan atau bukan milik Anda.`,
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        payment_id: order.id,
        external_id: order.external_id,
        amount: order.amount,
        currency: order.currency,
        status: order.status,
        description: order.description,
        qr_string: order.qr_string,
        created_at: order.created_at,
        paid_at: order.paid_at,
        expires_at: order.payment_window_end,
        matched_transaction_id: order.matched_transaction_id,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: err.message || "Terjadi kesalahan internal.",
        },
      },
      { status: 500 }
    );
  }
}
