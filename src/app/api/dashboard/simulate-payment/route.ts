import { NextRequest, NextResponse } from "next/server";
import { getDashboardSessionUser } from "@/server/auth/session";
import { db } from "@/server/db/unified-db";
import { runMatchingEngine } from "@/server/services/matching-engine";

export async function POST(req: NextRequest) {
  try {
    const user = await getDashboardSessionUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const orderId = body.order_id;

    if (!orderId) {
      return NextResponse.json({ success: false, error: "order_id is required" }, { status: 400 });
    }

    const order = await db.orders.getById(orderId, user.id);
    if (!order) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }

    if (order.status !== "PENDING") {
      return NextResponse.json(
        { success: false, error: `Hanya order PENDING yang dapat disimulasikan pembayarannya (status saat ini: ${order.status}).` },
        { status: 400 }
      );
    }

    const connection = await db.connections.getByOwnerId(user.id);
    const connectionId = connection?.id || order.connection_id || "conn_sandbox_default";
    const merchantId = connection?.merchant_id || "GBZ-MCH-001";

    const simTxId = `sim_tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    // 1. Insert provider transaction into DB
    const tx = await db.transactions.upsert({
      connection_id: connectionId,
      provider_transaction_id: simTxId,
      merchant_id: merchantId,
      payable_amount: order.amount,
      currency: order.currency,
      transaction_status: "SUCCESS",
      transaction_time: nowIso,
      source: "MOCK",
      raw_payload: { simulated_by: user.id, order_id: order.id },
      matched_order_id: null,
      match_status: "UNMATCHED",
    });

    // 2. Run matching engine
    const matchResult = await runMatchingEngine(connectionId, user.id);

    // 3. Fetch updated order
    const updatedOrder = await db.orders.getById(order.id, user.id);

    return NextResponse.json({
      success: true,
      message: "Simulasi pembayaran berhasil diproses dan dicocokkan.",
      transaction: tx,
      order: updatedOrder,
      matchResult,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
