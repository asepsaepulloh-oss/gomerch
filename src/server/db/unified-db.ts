import crypto from "node:crypto";
import { query, queryOne } from "@/server/db/pg-client";

export interface DBProfile {
  id: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface DBMerchantConnection {
  id: string;
  owner_id: string;
  provider: string;
  merchant_id: string | null;
  merchant_name: string | null;
  country_code: string;
  phone_masked: string | null;
  access_token_enc: any | null;
  refresh_token_enc: any | null;
  token_expires_at: string | null;
  status: "NOT_CONNECTED" | "OTP_PENDING" | "CONNECTED" | "TOKEN_EXPIRED" | "REAUTH_REQUIRED" | "CONNECTION_ERROR";
  last_sync_at: string | null;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface DBPaymentOrder {
  id: string;
  owner_id: string;
  connection_id: string | null;
  provider_payment_id: string | null;
  external_id: string;
  amount: number;
  currency: string;
  description: string | null;
  status: "PENDING" | "PAID" | "EXPIRED" | "CANCELLED" | "FAILED" | "NEEDS_REVIEW";
  qr_string: string | null;
  qr_payload_enc: any | null;
  payment_window_start: string;
  payment_window_end: string | null;
  matched_transaction_id: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DBProviderTransaction {
  id: string;
  connection_id: string;
  provider_transaction_id: string;
  merchant_id: string;
  payable_amount: number;
  currency: string;
  transaction_status: string;
  transaction_time: string;
  source: "GOBIZ_ANALYTICS" | "MOCK" | "CSV_IMPORT" | "WEBHOOK";
  raw_payload: any | null;
  matched_order_id: string | null;
  match_status: "UNMATCHED" | "MATCHED" | "CONFLICT" | "IGNORED";
  created_at: string;
}

export interface DBApiKey {
  id: string;
  owner_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  environment: "sandbox" | "production";
  permissions: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface DBWebhookEndpoint {
  id: string;
  owner_id: string;
  url: string;
  signing_secret_enc: any;
  signing_secret_preview: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface DBWebhookEvent {
  id: string;
  owner_id: string;
  event_type: string;
  resource_id: string | null;
  payload: any;
  created_at: string;
}

export interface DBWebhookDelivery {
  id: string;
  endpoint_id: string;
  event_id: string;
  attempt_count: number;
  http_status: number | null;
  response_excerpt: string | null;
  error_message: string | null;
  next_attempt_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface DBIdempotencyRecord {
  id: string;
  owner_id: string;
  idempotency_key: string;
  request_fingerprint: string;
  status: "PROCESSING" | "COMPLETED" | "FAILED";
  response_code: number | null;
  response_body: any | null;
  resource_id: string | null;
  expires_at: string;
  created_at: string;
}

export interface DBSyncCursor {
  id: string;
  connection_id: string;
  provider: string;
  last_cursor: string | null;
  last_sync_time: string | null;
  updated_at: string;
}

export interface DBAuditLog {
  id: string;
  owner_id: string | null;
  action: string;
  details: any;
  ip_address: string | null;
  created_at: string;
}

export const db = {
  // -------------------------------------------------------------
  // Merchant Connections
  // -------------------------------------------------------------
  connections: {
    async getByOwnerId(ownerId: string): Promise<DBMerchantConnection | null> {
      try {
        return await queryOne<DBMerchantConnection>(
          "SELECT * FROM public.merchant_connections WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 1",
          [ownerId]
        );
      } catch (err) {
        console.error("DB getByOwnerId error:", err);
        return null;
      }
    },

    async upsert(record: Partial<DBMerchantConnection> & { owner_id: string }): Promise<DBMerchantConnection> {
      const now = new Date().toISOString();
      const existing = await db.connections.getByOwnerId(record.owner_id);

      if (existing) {
        const updated = await queryOne<DBMerchantConnection>(
          `UPDATE public.merchant_connections
           SET provider = COALESCE($1, provider),
               merchant_id = COALESCE($2, merchant_id),
               merchant_name = COALESCE($3, merchant_name),
               country_code = COALESCE($4, country_code),
               phone_masked = COALESCE($5, phone_masked),
               access_token_enc = COALESCE($6, access_token_enc),
               refresh_token_enc = COALESCE($7, refresh_token_enc),
               token_expires_at = COALESCE($8, token_expires_at),
               status = COALESCE($9, status),
               last_sync_at = COALESCE($10, last_sync_at),
               last_error_code = COALESCE($11, last_error_code),
               updated_at = $12
           WHERE id = $13
           RETURNING *`,
          [
            record.provider || null,
            record.merchant_id || null,
            record.merchant_name || null,
            record.country_code || null,
            record.phone_masked || null,
            record.access_token_enc ? JSON.stringify(record.access_token_enc) : null,
            record.refresh_token_enc ? JSON.stringify(record.refresh_token_enc) : null,
            record.token_expires_at || null,
            record.status || null,
            record.last_sync_at || null,
            record.last_error_code || null,
            now,
            existing.id,
          ]
        );
        return updated!;
      } else {
        const id = record.id || crypto.randomUUID();
        const inserted = await queryOne<DBMerchantConnection>(
          `INSERT INTO public.merchant_connections (
             id, owner_id, provider, merchant_id, merchant_name,
             country_code, phone_masked, access_token_enc, refresh_token_enc,
             token_expires_at, status, last_sync_at, last_error_code, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           RETURNING *`,
          [
            id,
            record.owner_id,
            record.provider || "gobiz",
            record.merchant_id || null,
            record.merchant_name || null,
            record.country_code || "62",
            record.phone_masked || null,
            record.access_token_enc ? JSON.stringify(record.access_token_enc) : null,
            record.refresh_token_enc ? JSON.stringify(record.refresh_token_enc) : null,
            record.token_expires_at || null,
            record.status || "NOT_CONNECTED",
            record.last_sync_at || null,
            record.last_error_code || null,
            now,
            now,
          ]
        );
        return inserted!;
      }
    },

    async listActive(): Promise<DBMerchantConnection[]> {
      try {
        return await query<DBMerchantConnection>(
          "SELECT * FROM public.merchant_connections WHERE status = 'CONNECTED'"
        );
      } catch (err) {
        console.error("DB listActive error:", err);
        return [];
      }
    },
  },

  // -------------------------------------------------------------
  // Payment Orders
  // -------------------------------------------------------------
  orders: {
    async create(order: Omit<DBPaymentOrder, "id" | "created_at" | "updated_at"> & { id?: string }): Promise<DBPaymentOrder> {
      const now = new Date().toISOString();
      const id = order.id || crypto.randomUUID();

      const inserted = await queryOne<DBPaymentOrder>(
        `INSERT INTO public.payment_orders (
           id, owner_id, connection_id, provider_payment_id, external_id,
           amount, currency, description, status, qr_string, qr_payload_enc,
           payment_window_start, payment_window_end, matched_transaction_id, paid_at,
           created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING *`,
        [
          id,
          order.owner_id,
          order.connection_id || null,
          order.provider_payment_id || null,
          order.external_id,
          order.amount,
          order.currency || "IDR",
          order.description || null,
          order.status || "PENDING",
          order.qr_string || null,
          order.qr_payload_enc ? JSON.stringify(order.qr_payload_enc) : null,
          order.payment_window_start || now,
          order.payment_window_end || null,
          order.matched_transaction_id || null,
          order.paid_at || null,
          now,
          now,
        ]
      );
      return inserted!;
    },

    async getById(id: string, ownerId?: string): Promise<DBPaymentOrder | null> {
      try {
        if (ownerId) {
          return await queryOne<DBPaymentOrder>(
            "SELECT * FROM public.payment_orders WHERE id = $1 AND owner_id = $2",
            [id, ownerId]
          );
        }
        return await queryOne<DBPaymentOrder>(
          "SELECT * FROM public.payment_orders WHERE id = $1",
          [id]
        );
      } catch (err) {
        return null;
      }
    },

    async getByExternalId(externalId: string, ownerId: string): Promise<DBPaymentOrder | null> {
      try {
        return await queryOne<DBPaymentOrder>(
          "SELECT * FROM public.payment_orders WHERE external_id = $1 AND owner_id = $2",
          [externalId, ownerId]
        );
      } catch (err) {
        return null;
      }
    },

    async listByOwner(
      ownerId: string,
      options?: {
        status?: string;
        limit?: number;
        offset?: number;
        from?: string;
        to?: string;
      }
    ): Promise<{ orders: DBPaymentOrder[]; total: number }> {
      try {
        const limit = options?.limit || 20;
        const offset = options?.offset || 0;

        let sql = "SELECT * FROM public.payment_orders WHERE owner_id = $1";
        const params: any[] = [ownerId];

        if (options?.status) {
          params.push(options.status);
          sql += ` AND status = $${params.length}`;
        }
        if (options?.from) {
          params.push(options.from);
          sql += ` AND created_at >= $${params.length}`;
        }
        if (options?.to) {
          params.push(options.to);
          sql += ` AND created_at <= $${params.length}`;
        }

        const countRes = await queryOne<{ count: string }>(
          sql.replace("SELECT *", "SELECT COUNT(*) as count"),
          params
        );
        const total = parseInt(countRes?.count || "0", 10);

        params.push(limit);
        const limitParam = params.length;
        params.push(offset);
        const offsetParam = params.length;

        sql += ` ORDER BY created_at DESC LIMIT $${limitParam} OFFSET $${offsetParam}`;

        const orders = await query<DBPaymentOrder>(sql, params);
        return { orders, total };
      } catch (err) {
        console.error("DB listByOwner error:", err);
        return { orders: [], total: 0 };
      }
    },

    async updateStatus(
      id: string,
      updates: {
        status: DBPaymentOrder["status"];
        paid_at?: string | null;
        matched_transaction_id?: string | null;
      }
    ): Promise<DBPaymentOrder> {
      const now = new Date().toISOString();
      const updated = await queryOne<DBPaymentOrder>(
        `UPDATE public.payment_orders
         SET status = $1,
             paid_at = COALESCE($2, paid_at),
             matched_transaction_id = COALESCE($3, matched_transaction_id),
             updated_at = $4
         WHERE id = $5
         RETURNING *`,
        [updates.status, updates.paid_at || null, updates.matched_transaction_id || null, now, id]
      );
      if (!updated) throw new Error(`Order ${id} not found.`);
      return updated;
    },
  },

  // -------------------------------------------------------------
  // Provider Transactions
  // -------------------------------------------------------------
  transactions: {
    async upsert(tx: Omit<DBProviderTransaction, "id" | "created_at"> & { id?: string }): Promise<DBProviderTransaction> {
      const now = new Date().toISOString();
      const id = tx.id || crypto.randomUUID();

      const inserted = await queryOne<DBProviderTransaction>(
        `INSERT INTO public.provider_transactions (
           id, connection_id, provider_transaction_id, merchant_id,
           payable_amount, currency, transaction_status, transaction_time,
           source, raw_payload, matched_order_id, match_status, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (connection_id, provider_transaction_id) DO UPDATE
         SET payable_amount = EXCLUDED.payable_amount,
             transaction_status = EXCLUDED.transaction_status,
             transaction_time = EXCLUDED.transaction_time,
             raw_payload = EXCLUDED.raw_payload
         RETURNING *`,
        [
          id,
          tx.connection_id,
          tx.provider_transaction_id,
          tx.merchant_id,
          tx.payable_amount,
          tx.currency || "IDR",
          tx.transaction_status,
          tx.transaction_time,
          tx.source,
          tx.raw_payload ? JSON.stringify(tx.raw_payload) : null,
          tx.matched_order_id || null,
          tx.match_status || "UNMATCHED",
          now,
        ]
      );
      return inserted!;
    },

    async listByConnection(connectionId: string, limit = 50): Promise<DBProviderTransaction[]> {
      try {
        return await query<DBProviderTransaction>(
          "SELECT * FROM public.provider_transactions WHERE connection_id = $1 ORDER BY transaction_time DESC LIMIT $2",
          [connectionId, limit]
        );
      } catch (err) {
        return [];
      }
    },

    async listUnmatched(connectionId: string): Promise<DBProviderTransaction[]> {
      try {
        return await query<DBProviderTransaction>(
          `SELECT * FROM public.provider_transactions 
           WHERE connection_id = $1 AND match_status = 'UNMATCHED' AND transaction_status = 'SUCCESS'`,
          [connectionId]
        );
      } catch (err) {
        return [];
      }
    },

    async markMatched(id: string, orderId: string, status: "MATCHED" | "CONFLICT" = "MATCHED") {
      try {
        await query(
          "UPDATE public.provider_transactions SET matched_order_id = $1, match_status = $2 WHERE id = $3",
          [orderId, status, id]
        );
      } catch (err) {
        console.error("DB markMatched error:", err);
      }
    },
  },

  // -------------------------------------------------------------
  // API Keys
  // -------------------------------------------------------------
  apiKeys: {
    async create(key: Omit<DBApiKey, "id" | "created_at" | "last_used_at" | "revoked_at">): Promise<DBApiKey> {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();

      const inserted = await queryOne<DBApiKey>(
        `INSERT INTO public.api_keys (
           id, owner_id, name, key_prefix, key_hash, environment, permissions, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          id,
          key.owner_id,
          key.name,
          key.key_prefix,
          key.key_hash,
          key.environment,
          JSON.stringify(key.permissions || ["payments:read", "payments:write"]),
          now,
        ]
      );
      return inserted!;
    },

    async findByHash(keyHash: string): Promise<DBApiKey | null> {
      try {
        return await queryOne<DBApiKey>(
          "SELECT * FROM public.api_keys WHERE key_hash = $1 LIMIT 1",
          [keyHash]
        );
      } catch (err) {
        return null;
      }
    },

    async listByOwner(ownerId: string): Promise<DBApiKey[]> {
      try {
        return await query<DBApiKey>(
          "SELECT * FROM public.api_keys WHERE owner_id = $1 ORDER BY created_at DESC",
          [ownerId]
        );
      } catch (err) {
        return [];
      }
    },

    async revoke(id: string, ownerId: string): Promise<boolean> {
      try {
        const now = new Date().toISOString();
        const res = await query(
          "UPDATE public.api_keys SET revoked_at = $1 WHERE id = $2 AND owner_id = $3",
          [now, id, ownerId]
        );
        return true;
      } catch (err) {
        return false;
      }
    },

    async updateLastUsed(id: string): Promise<void> {
      try {
        const now = new Date().toISOString();
        await query("UPDATE public.api_keys SET last_used_at = $1 WHERE id = $2", [now, id]);
      } catch (err) {}
    },
  },

  // -------------------------------------------------------------
  // Webhook Endpoints & Deliveries
  // -------------------------------------------------------------
  webhooks: {
    async createEndpoint(endpoint: Omit<DBWebhookEndpoint, "id" | "created_at" | "updated_at">): Promise<DBWebhookEndpoint> {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();

      const inserted = await queryOne<DBWebhookEndpoint>(
        `INSERT INTO public.webhook_endpoints (
           id, owner_id, url, signing_secret_enc, signing_secret_preview, enabled, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          id,
          endpoint.owner_id,
          endpoint.url,
          JSON.stringify(endpoint.signing_secret_enc),
          endpoint.signing_secret_preview,
          endpoint.enabled ?? true,
          now,
          now,
        ]
      );
      return inserted!;
    },

    async listEndpoints(ownerId: string): Promise<DBWebhookEndpoint[]> {
      try {
        return await query<DBWebhookEndpoint>(
          "SELECT * FROM public.webhook_endpoints WHERE owner_id = $1 ORDER BY created_at DESC",
          [ownerId]
        );
      } catch (err) {
        return [];
      }
    },

    async deleteEndpoint(id: string, ownerId: string): Promise<boolean> {
      try {
        await query(
          "DELETE FROM public.webhook_endpoints WHERE id = $1 AND owner_id = $2",
          [id, ownerId]
        );
        return true;
      } catch (err) {
        return false;
      }
    },

    async createEvent(event: Omit<DBWebhookEvent, "id" | "created_at">): Promise<DBWebhookEvent> {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();

      const inserted = await queryOne<DBWebhookEvent>(
        `INSERT INTO public.webhook_events (id, owner_id, event_type, resource_id, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          id,
          event.owner_id,
          event.event_type,
          event.resource_id || null,
          JSON.stringify(event.payload),
          now,
        ]
      );
      return inserted!;
    },

    async listEvents(ownerId: string, limit = 50): Promise<DBWebhookEvent[]> {
      try {
        return await query<DBWebhookEvent>(
          "SELECT * FROM public.webhook_events WHERE owner_id = $1 ORDER BY created_at DESC LIMIT $2",
          [ownerId, limit]
        );
      } catch (err) {
        return [];
      }
    },

    async recordDelivery(delivery: Omit<DBWebhookDelivery, "id" | "created_at">): Promise<DBWebhookDelivery> {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();

      const inserted = await queryOne<DBWebhookDelivery>(
        `INSERT INTO public.webhook_deliveries (
           id, endpoint_id, event_id, attempt_count, http_status, response_excerpt,
           error_message, next_attempt_at, delivered_at, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          id,
          delivery.endpoint_id,
          delivery.event_id,
          delivery.attempt_count || 1,
          delivery.http_status || null,
          delivery.response_excerpt || null,
          delivery.error_message || null,
          delivery.next_attempt_at || null,
          delivery.delivered_at || null,
          now,
        ]
      );
      return inserted!;
    },

    async listDeliveries(endpointId: string, limit = 50): Promise<DBWebhookDelivery[]> {
      try {
        return await query<DBWebhookDelivery>(
          "SELECT * FROM public.webhook_deliveries WHERE endpoint_id = $1 ORDER BY created_at DESC LIMIT $2",
          [endpointId, limit]
        );
      } catch (err) {
        return [];
      }
    },
  },

  // -------------------------------------------------------------
  // Idempotency
  // -------------------------------------------------------------
  idempotency: {
    async get(ownerId: string, idempotencyKey: string): Promise<DBIdempotencyRecord | null> {
      try {
        return await queryOne<DBIdempotencyRecord>(
          "SELECT * FROM public.idempotency_records WHERE owner_id = $1 AND idempotency_key = $2",
          [ownerId, idempotencyKey]
        );
      } catch (err) {
        return null;
      }
    },

    async create(record: Omit<DBIdempotencyRecord, "id" | "created_at">): Promise<DBIdempotencyRecord> {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();

      const inserted = await queryOne<DBIdempotencyRecord>(
        `INSERT INTO public.idempotency_records (
           id, owner_id, idempotency_key, request_fingerprint, status,
           response_code, response_body, resource_id, expires_at, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          id,
          record.owner_id,
          record.idempotency_key,
          record.request_fingerprint,
          record.status || "PROCESSING",
          record.response_code || null,
          record.response_body ? JSON.stringify(record.response_body) : null,
          record.resource_id || null,
          record.expires_at,
          now,
        ]
      );
      return inserted!;
    },

    async complete(
      ownerId: string,
      idempotencyKey: string,
      responseCode: number,
      responseBody: any,
      resourceId?: string
    ): Promise<void> {
      try {
        await query(
          `UPDATE public.idempotency_records 
           SET status = 'COMPLETED',
               response_code = $1,
               response_body = $2,
               resource_id = COALESCE($3, resource_id)
           WHERE owner_id = $4 AND idempotency_key = $5`,
          [responseCode, JSON.stringify(responseBody), resourceId || null, ownerId, idempotencyKey]
        );
      } catch (err) {
        console.error("DB complete idempotency error:", err);
      }
    },
  },

  // -------------------------------------------------------------
  // Sync Cursors
  // -------------------------------------------------------------
  cursors: {
    async get(connectionId: string): Promise<DBSyncCursor | null> {
      try {
        return await queryOne<DBSyncCursor>(
          "SELECT * FROM public.sync_cursors WHERE connection_id = $1",
          [connectionId]
        );
      } catch (err) {
        return null;
      }
    },

    async update(connectionId: string, provider: string, cursor: string | null, syncTime: string): Promise<void> {
      const now = new Date().toISOString();
      try {
        await query(
          `INSERT INTO public.sync_cursors (connection_id, provider, last_cursor, last_sync_time, updated_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (connection_id) DO UPDATE
           SET provider = EXCLUDED.provider,
               last_cursor = EXCLUDED.last_cursor,
               last_sync_time = EXCLUDED.last_sync_time,
               updated_at = EXCLUDED.updated_at`,
          [connectionId, provider, cursor, syncTime, now]
        );
      } catch (err) {
        console.error("DB update cursor error:", err);
      }
    },
  },

  // -------------------------------------------------------------
  // Audit Logs
  // -------------------------------------------------------------
  audit: {
    async log(action: string, ownerId: string | null, details: any, ipAddress?: string | null): Promise<void> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      try {
        await query(
          `INSERT INTO public.audit_logs (id, owner_id, action, details, ip_address, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, ownerId, action, JSON.stringify(details), ipAddress || null, now]
        );
      } catch (err) {
        console.error("DB audit.log error:", err);
      }
    },

    async list(ownerId?: string, limit = 50): Promise<DBAuditLog[]> {
      try {
        if (ownerId) {
          return await query<DBAuditLog>(
            "SELECT * FROM public.audit_logs WHERE owner_id = $1 ORDER BY created_at DESC LIMIT $2",
            [ownerId, limit]
          );
        }
        return await query<DBAuditLog>(
          "SELECT * FROM public.audit_logs ORDER BY created_at DESC LIMIT $1",
          [limit]
        );
      } catch (err) {
        return [];
      }
    },
  },
};
