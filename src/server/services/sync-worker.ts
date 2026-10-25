import { db, DBMerchantConnection } from "@/server/db/unified-db";
import { GobizAdapter, GobizTransactionProvider } from "@/server/providers/gobiz/adapter";
import { decryptToken, encryptToken } from "@/server/security/token-encryption";
import { runMatchingEngine } from "./matching-engine";

export interface SyncResult {
  connectionId: string;
  success: boolean;
  transactionsFetched: number;
  matchedOrders: number;
  conflicts: number;
  error?: string;
}

export async function syncMerchantTransactions(connection: DBMerchantConnection): Promise<SyncResult> {
  const connectionId = connection.id;
  const ownerId = connection.owner_id;

  try {
    let accessToken: string | undefined;

    // Check token if connection has stored encrypted token
    if (connection.access_token_enc) {
      try {
        accessToken = decryptToken(connection.access_token_enc);
      } catch (err: any) {
        await db.connections.upsert({
          owner_id: ownerId,
          id: connectionId,
          status: "REAUTH_REQUIRED",
          last_error_code: "TOKEN_DECRYPTION_FAILED",
        });
        return {
          connectionId,
          success: false,
          transactionsFetched: 0,
          matchedOrders: 0,
          conflicts: 0,
          error: "Gagal mendeskripsi token GoBiz. Perlu otentikasi ulang.",
        };
      }
    }

    // Check if token is expired and refresh token is available
    if (connection.token_expires_at && new Date(connection.token_expires_at).getTime() < Date.now()) {
      if (connection.refresh_token_enc) {
        try {
          const refreshToken = decryptToken(connection.refresh_token_enc);
          const adapter = new GobizAdapter();
          const refreshed = await adapter.refreshToken(refreshToken);

          accessToken = refreshed.accessToken;
          const newAccessEnc = encryptToken(refreshed.accessToken);
          const newRefreshEnc = refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : connection.refresh_token_enc;
          const newExpiresAt = new Date(Date.now() + (refreshed.expiresIn || 86400) * 1000).toISOString();

          await db.connections.upsert({
            owner_id: ownerId,
            id: connectionId,
            access_token_enc: newAccessEnc,
            refresh_token_enc: newRefreshEnc,
            token_expires_at: newExpiresAt,
            status: "CONNECTED",
          });
        } catch {
          await db.connections.upsert({
            owner_id: ownerId,
            id: connectionId,
            status: "TOKEN_EXPIRED",
            last_error_code: "TOKEN_REFRESH_FAILED",
          });
          return {
            connectionId,
            success: false,
            transactionsFetched: 0,
            matchedOrders: 0,
            conflicts: 0,
            error: "Token GoBiz telah kedaluwarsa dan gagal diperbarui secara otomatis.",
          };
        }
      } else {
        await db.connections.upsert({
          owner_id: ownerId,
          id: connectionId,
          status: "TOKEN_EXPIRED",
        });
      }
    }

    // Fetch transactions from provider
    const cursorRecord = await db.cursors.get(connectionId);
    const provider = new GobizTransactionProvider();
    const page = await provider.fetchTransactions({
      merchantId: connection.merchant_id || "GBZ-DEFAULT",
      cursor: cursorRecord?.last_cursor || undefined,
      accessToken,
    });

    // Deduplicate & save transactions
    let savedCount = 0;
    for (const tx of page.transactions) {
      await db.transactions.upsert({
        connection_id: connectionId,
        provider_transaction_id: tx.id,
        merchant_id: tx.merchantId,
        payable_amount: tx.payableAmount,
        currency: tx.currency,
        transaction_status: tx.transactionStatus,
        transaction_time: tx.transactionTime,
        source: tx.source,
        raw_payload: tx.rawPayload || null,
        matched_order_id: null,
        match_status: "UNMATCHED",
      });
      savedCount++;
    }

    // Update cursor & sync timestamp
    const nowIso = new Date().toISOString();
    await db.cursors.update(connectionId, "gobiz", page.nextCursor || null, nowIso);
    await db.connections.upsert({
      owner_id: ownerId,
      id: connectionId,
      last_sync_at: nowIso,
    });

    // Run matching engine
    const matchResult = await runMatchingEngine(connectionId, ownerId);

    // Audit log
    await db.audit.log("SYNC_TRANSACTIONS", ownerId, {
      connectionId,
      fetched: savedCount,
      matched: matchResult.matchedCount,
      conflicts: matchResult.conflictCount,
    });

    return {
      connectionId,
      success: true,
      transactionsFetched: savedCount,
      matchedOrders: matchResult.matchedCount,
      conflicts: matchResult.conflictCount,
    };
  } catch (err: any) {
    await db.connections.upsert({
      owner_id: ownerId,
      id: connectionId,
      last_error_code: err.message,
    });

    return {
      connectionId,
      success: false,
      transactionsFetched: 0,
      matchedOrders: 0,
      conflicts: 0,
      error: err.message,
    };
  }
}

/**
 * Triggers sync across all active merchant connections (called by cron route).
 */
export async function runGlobalSyncWorker(): Promise<SyncResult[]> {
  const activeConnections = await db.connections.listActive();
  const results: SyncResult[] = [];

  for (const conn of activeConnections) {
    const res = await syncMerchantTransactions(conn);
    results.push(res);
  }

  return results;
}
