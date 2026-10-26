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
    const transactions = body.transactions;

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json(
        { success: false, error: "Data transaksi tidak valid atau kosong. Harap kirimkan array JSON transaksi." },
        { status: 400 }
      );
    }

    const connection = await db.connections.getByOwnerId(user.id);
    const connectionId = connection?.id || "conn_gofood_portal";
    const merchantId = connection?.merchant_id || "GBZ-GOFOOD-PORTAL";

    let insertedCount = 0;

    for (const tx of transactions) {
      // Parse amount
      let amount = 0;
      if (typeof tx.jumlah === "number" && tx.jumlah > 0) {
        amount = tx.jumlah;
      } else if (tx.penjualanKotor) {
        const numStr = String(tx.penjualanKotor).replace(/Rp\s*/gi, "").replace(/\./g, "").replace(/,/g, "");
        amount = parseInt(numStr, 10) || 0;
      } else if (tx.amount) {
        amount = Number(tx.amount);
      }

      if (amount <= 0) continue;

      // Transaction ID / Reference
      const providerTxId = tx.idReferensiGopay || tx.idPesanan || tx.orderId || tx.id || `TX-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const txTime = tx.tanggalWaktu ? new Date().toISOString() : new Date().toISOString();

      await db.transactions.upsert({
        connection_id: connectionId,
        provider_transaction_id: providerTxId,
        merchant_id: merchantId,
        payable_amount: amount,
        currency: "IDR",
        transaction_status: "SUCCESS",
        transaction_time: txTime,
        source: "CSV_IMPORT",
        raw_payload: tx,
        matched_order_id: null,
        match_status: "UNMATCHED",
      });

      insertedCount++;
    }

    // Trigger matching engine
    const matchResult = await runMatchingEngine(connectionId, user.id);

    return NextResponse.json({
      success: true,
      message: `Berhasil mengimpor ${insertedCount} transaksi dari GoFood Portal. ${matchResult.matchedCount} order berhasil dicocokkan (PAID).`,
      imported_count: insertedCount,
      matchResult,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
