import { NextRequest, NextResponse } from "next/server";
import { getDashboardSessionUser } from "@/server/auth/session";
import { db } from "@/server/db/unified-db";

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
