import { db, DBPaymentOrder, DBProviderTransaction } from "@/server/db/unified-db";
import { dispatchWebhookEvent } from "./webhook-service";

export interface MatchEvaluationResult {
  isMatch: boolean;
  reason?: string;
}

/**
 * Validates all strict matching criteria between an order and a provider transaction.
 */
export function evaluateTransactionMatch(
  order: DBPaymentOrder,
  tx: DBProviderTransaction
): MatchEvaluationResult {
  // 1. Order must currently be PENDING
  if (order.status !== "PENDING") {
    return { isMatch: false, reason: `Status order ${order.status} bukan PENDING` };
  }

  // 2. Transaction status must be SUCCESS
  if (tx.transaction_status !== "SUCCESS") {
    return { isMatch: false, reason: `Status transaksi provider bukan SUCCESS (${tx.transaction_status})` };
  }

  // 3. Amount must match exactly
  if (Number(order.amount) !== Number(tx.payable_amount)) {
    return { isMatch: false, reason: `Nominal tidak cocok: order=${order.amount}, tx=${tx.payable_amount}` };
  }

  // 4. Currency must match
  if (order.currency.toUpperCase() !== tx.currency.toUpperCase()) {
    return { isMatch: false, reason: `Mata uang tidak cocok: order=${order.currency}, tx=${tx.currency}` };
  }

  // 5. Transaction must not be previously matched to another order
  if (tx.match_status !== "UNMATCHED" || tx.matched_order_id) {
    return { isMatch: false, reason: "Transaksi telah digunakan untuk order lain" };
  }

  // 6. Time window check
  const txTime = new Date(tx.transaction_time).getTime();
  const windowStart = new Date(order.payment_window_start).getTime() - 60000; // 1-minute buffer for network clock skew
  const windowEnd = order.payment_window_end 
    ? new Date(order.payment_window_end).getTime() + 60000 
    : windowStart + 86400000; // default 24hr window

  if (txTime < windowStart || txTime > windowEnd) {
    return { isMatch: false, reason: "Waktu transaksi berada di luar jendela pembayaran order" };
  }

  return { isMatch: true };
}

/**
 * Executes matching engine against all unmatched transactions for a connection.
 */
export async function runMatchingEngine(connectionId: string, ownerId: string): Promise<{
  matchedCount: number;
  conflictCount: number;
}> {
  const unmatchedTransactions = await db.transactions.listUnmatched(connectionId);
  const pendingOrdersResponse = await db.orders.listByOwner(ownerId, { status: "PENDING", limit: 100 });
  const pendingOrders = pendingOrdersResponse.orders.filter(
    o => !o.connection_id || o.connection_id === connectionId
  );

  let matchedCount = 0;
  let conflictCount = 0;

  for (const tx of unmatchedTransactions) {
    // Find all candidate orders that match this transaction
    const candidateOrders: DBPaymentOrder[] = [];

    for (const order of pendingOrders) {
      const evaluation = evaluateTransactionMatch(order, tx);
      if (evaluation.isMatch) {
        candidateOrders.push(order);
      }
    }

    if (candidateOrders.length === 1) {
      // Clean single match - execute atomic status transition
      const targetOrder = candidateOrders[0];

      // Atomic transition PENDING -> PAID
      await db.orders.updateStatus(targetOrder.id, {
        status: "PAID",
        paid_at: tx.transaction_time,
        matched_transaction_id: tx.id,
      });

      await db.transactions.markMatched(tx.id, targetOrder.id, "MATCHED");

      // Dispatch webhook
      await dispatchWebhookEvent({
        ownerId: targetOrder.owner_id,
        eventType: "payment.paid",
        resourceId: targetOrder.id,
        data: {
          payment_id: targetOrder.id,
          external_id: targetOrder.external_id,
          amount: targetOrder.amount,
          currency: targetOrder.currency,
          status: "PAID",
          provider_transaction_id: tx.provider_transaction_id,
          paid_at: tx.transaction_time,
        },
      });

      // Remove targetOrder from in-flight pending list
      const idx = pendingOrders.findIndex(o => o.id === targetOrder.id);
      if (idx >= 0) pendingOrders.splice(idx, 1);

      matchedCount++;
    } else if (candidateOrders.length > 1) {
      // Ambiguity conflict! Multiple orders match identical amount and time window
      // DO NOT GUESS. Flag as NEEDS_REVIEW and CONFLICT.
      conflictCount++;
      await db.transactions.markMatched(tx.id, candidateOrders[0].id, "CONFLICT");

      for (const conflictingOrder of candidateOrders) {
        await db.orders.updateStatus(conflictingOrder.id, {
          status: "NEEDS_REVIEW",
        });
      }
    }
  }

  return { matchedCount, conflictCount };
}
