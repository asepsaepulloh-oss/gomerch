import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/server/security/api-keys";
import { db } from "@/server/db/unified-db";

export async function GET(req: NextRequest) {
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
    const url = new URL(req.url);

    const status = url.searchParams.get("status") || undefined;
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
    const offset = (page - 1) * limit;
    const from = url.searchParams.get("from") || undefined;
    const to = url.searchParams.get("to") || undefined;

    const { orders, total } = await db.orders.listByOwner(ownerId, {
      status,
      limit,
      offset,
      from,
      to,
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
        total_pages: Math.ceil(total / limit),
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
