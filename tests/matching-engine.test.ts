import { describe, it, expect } from "vitest";
import { evaluateTransactionMatch } from "@/server/services/matching-engine";
import { DBPaymentOrder, DBProviderTransaction } from "@/server/db/unified-db";

describe("Payment Matching Engine", () => {
  const baseOrder: DBPaymentOrder = {
    id: "ord_1",
    owner_id: "usr_1",
    connection_id: "conn_1",
    provider_payment_id: "prov_pay_1",
    external_id: "ORDER-1001",
    amount: 50000,
    currency: "IDR",
    description: "Dinner",
    status: "PENDING",
    qr_string: "000201...",
    qr_payload_enc: null,
    payment_window_start: "2026-10-25T10:00:00.000Z",
    payment_window_end: "2026-10-25T10:15:00.000Z",
    matched_transaction_id: null,
    paid_at: null,
    created_at: "2026-10-25T10:00:00.000Z",
    updated_at: "2026-10-25T10:00:00.000Z",
  };

  const validTx: DBProviderTransaction = {
    id: "tx_1",
    connection_id: "conn_1",
    provider_transaction_id: "gbz_tx_999",
    merchant_id: "MCH_1",
    payable_amount: 50000,
    currency: "IDR",
    transaction_status: "SUCCESS",
    transaction_time: "2026-10-25T10:05:00.000Z",
    source: "GOBIZ_ANALYTICS",
    raw_payload: {},
    matched_order_id: null,
    match_status: "UNMATCHED",
    created_at: "2026-10-25T10:05:00.000Z",
  };

  it("successfully matches when amount, currency, status, and time window align", () => {
    const res = evaluateTransactionMatch(baseOrder, validTx);
    expect(res.isMatch).toBe(true);
  });

  it("rejects match if transaction amount differs", () => {
    const txWrongAmount = { ...validTx, payable_amount: 49000 };
    const res = evaluateTransactionMatch(baseOrder, txWrongAmount);
    expect(res.isMatch).toBe(false);
    expect(res.reason).toContain("Nominal tidak cocok");
  });

  it("rejects match if order is not PENDING", () => {
    const alreadyPaidOrder = { ...baseOrder, status: "PAID" as const };
    const res = evaluateTransactionMatch(alreadyPaidOrder, validTx);
    expect(res.isMatch).toBe(false);
    expect(res.reason).toContain("bukan PENDING");
  });

  it("rejects match if provider transaction status is not SUCCESS", () => {
    const failedTx = { ...validTx, transaction_status: "FAILED" };
    const res = evaluateTransactionMatch(baseOrder, failedTx);
    expect(res.isMatch).toBe(false);
    expect(res.reason).toContain("bukan SUCCESS");
  });

  it("rejects match if transaction is outside the order payment window", () => {
    const lateTx = { ...validTx, transaction_time: "2026-10-25T11:00:00.000Z" };
    const res = evaluateTransactionMatch(baseOrder, lateTx);
    expect(res.isMatch).toBe(false);
    expect(res.reason).toContain("jendela pembayaran");
  });

  it("rejects match if transaction was already matched to another order", () => {
    const usedTx = { ...validTx, match_status: "MATCHED" as const, matched_order_id: "other_ord" };
    const res = evaluateTransactionMatch(baseOrder, usedTx);
    expect(res.isMatch).toBe(false);
    expect(res.reason).toContain("telah digunakan");
  });
});
