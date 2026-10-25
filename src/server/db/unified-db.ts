import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";

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

/**
 * In-memory tables for local development, tests, or fallback when Supabase is not reachable.
 */
class MemoryDataStore {
  merchantConnections: DBMerchantConnection[] = [];
  paymentOrders: DBPaymentOrder[] = [];
  providerTransactions: DBProviderTransaction[] = [];
  apiKeys: DBApiKey[] = [];
  webhookEndpoints: DBWebhookEndpoint[] = [];
  webhookEvents: DBWebhookEvent[] = [];
  webhookDeliveries: DBWebhookDelivery[] = [];
  idempotencyRecords: DBIdempotencyRecord[] = [];
  syncCursors: DBSyncCursor[] = [];
  auditLogs: DBAuditLog[] = [];
}

const memoryStore = new MemoryDataStore();

const hasSupabaseConfig = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("dummy-project")
);

export const db = {
  // -------------------------------------------------------------
  // Merchant Connections
  // -------------------------------------------------------------
  connections: {
    async getByOwnerId(ownerId: string): Promise<DBMerchantConnection | null> {
      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          const { data, error } = await supabase
            .from("merchant_connections")
            .select("*")
            .eq("owner_id", ownerId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!error && data) return data as DBMerchantConnection;
        } catch {
          // fallback to memory
        }
      }
      return memoryStore.merchantConnections.find(c => c.owner_id === ownerId) || null;
    },

    async upsert(record: Partial<DBMerchantConnection> & { owner_id: string }): Promise<DBMerchantConnection> {
      const now = new Date().toISOString();
      const existing = await db.connections.getByOwnerId(record.owner_id);

      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          if (existing) {
            const { data, error } = await supabase
              .from("merchant_connections")
              .update({ ...record, updated_at: now })
              .eq("id", existing.id)
              .select()
              .single();
            if (!error && data) return data as DBMerchantConnection;
          } else {
            const { data, error } = await supabase
              .from("merchant_connections")
              .insert({
                id: crypto.randomUUID(),
                created_at: now,
                updated_at: now,
                provider: "gobiz",
                status: "NOT_CONNECTED",
                country_code: "62",
                ...record,
              })
              .select()
              .single();
            if (!error && data) return data as DBMerchantConnection;
          }
        } catch {
          // fallback to memory
        }
      }

      if (existing) {
        Object.assign(existing, record, { updated_at: now });
        return existing;
      } else {
        const newRecord: DBMerchantConnection = {
          id: record.id || crypto.randomUUID(),
          owner_id: record.owner_id,
          provider: record.provider || "gobiz",
          merchant_id: record.merchant_id || null,
          merchant_name: record.merchant_name || null,
          country_code: record.country_code || "62",
          phone_masked: record.phone_masked || null,
          access_token_enc: record.access_token_enc || null,
          refresh_token_enc: record.refresh_token_enc || null,
          token_expires_at: record.token_expires_at || null,
          status: record.status || "NOT_CONNECTED",
          last_sync_at: record.last_sync_at || null,
          last_error_code: record.last_error_code || null,
          created_at: now,
          updated_at: now,
        };
        memoryStore.merchantConnections.push(newRecord);
        return newRecord;
      }
    },

    async listActive(): Promise<DBMerchantConnection[]> {
      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          const { data, error } = await supabase
            .from("merchant_connections")
            .select("*")
            .eq("status", "CONNECTED");
          if (!error && data) return data as DBMerchantConnection[];
        } catch {}
      }
      return memoryStore.merchantConnections.filter(c => c.status === "CONNECTED");
    },
  },

  // -------------------------------------------------------------
  // Payment Orders
  // -------------------------------------------------------------
  orders: {
    async create(order: Omit<DBPaymentOrder, "id" | "created_at" | "updated_at"> & { id?: string }): Promise<DBPaymentOrder> {
      const now = new Date().toISOString();
      const id = order.id || crypto.randomUUID();

      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          const { data, error } = await supabase
            .from("payment_orders")
            .insert({ ...order, id, created_at: now, updated_at: now })
            .select()
            .single();
          if (!error && data) return data as DBPaymentOrder;
        } catch {}
      }

      const newOrder: DBPaymentOrder = {
        id,
        created_at: now,
        updated_at: now,
        ...order,
      };
      memoryStore.paymentOrders.push(newOrder);
      return newOrder;
    },

    async getById(id: string, ownerId?: string): Promise<DBPaymentOrder | null> {
      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          let query = supabase.from("payment_orders").select("*").eq("id", id);
          if (ownerId) query = query.eq("owner_id", ownerId);
          const { data, error } = await query.maybeSingle();
          if (!error && data) return data as DBPaymentOrder;
        } catch {}
      }

      return memoryStore.paymentOrders.find(
        o => o.id === id && (!ownerId || o.owner_id === ownerId)
      ) || null;
    },

    async getByExternalId(externalId: string, ownerId: string): Promise<DBPaymentOrder | null> {
      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          const { data, error } = await supabase
            .from("payment_orders")
            .select("*")
            .eq("external_id", externalId)
            .eq("owner_id", ownerId)
            .maybeSingle();
          if (!error && data) return data as DBPaymentOrder;
        } catch {}
      }

      return memoryStore.paymentOrders.find(
        o => o.external_id === externalId && o.owner_id === ownerId
      ) || null;
    },

    async listByOwner(ownerId: string, options?: {
      status?: string;
      limit?: number;
      offset?: number;
      from?: string;
      to?: string;
    }): Promise<{ orders: DBPaymentOrder[]; total: number }> {
      const limit = options?.limit || 20;
      const offset = options?.offset || 0;

      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          let query = supabase
            .from("payment_orders")
            .select("*", { count: "exact" })
            .eq("owner_id", ownerId);

          if (options?.status) query = query.eq("status", options.status);
          if (options?.from) query = query.gte("created_at", options.from);
          if (options?.to) query = query.lte("created_at", options.to);

          const { data, count, error } = await query
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);

          if (!error && data) {
            return { orders: data as DBPaymentOrder[], total: count || data.length };
          }
        } catch {}
      }

      let filtered = memoryStore.paymentOrders.filter(o => o.owner_id === ownerId);
      if (options?.status) filtered = filtered.filter(o => o.status === options.status);
      if (options?.from) filtered = filtered.filter(o => o.created_at >= options.from!);
      if (options?.to) filtered = filtered.filter(o => o.created_at <= options.to!);

      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const total = filtered.length;
      const sliced = filtered.slice(offset, offset + limit);

      return { orders: sliced, total };
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

      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          const { data, error } = await supabase
            .from("payment_orders")
            .update({ ...updates, updated_at: now })
            .eq("id", id)
            .select()
            .single();
          if (!error && data) return data as DBPaymentOrder;
        } catch {}
      }

      const order = memoryStore.paymentOrders.find(o => o.id === id);
      if (!order) throw new Error(`Order ${id} not found.`);
      Object.assign(order, updates, { updated_at: now });
      return order;
    },
  },

  // -------------------------------------------------------------
  // Provider Transactions
  // -------------------------------------------------------------
  transactions: {
    async upsert(tx: Omit<DBProviderTransaction, "id" | "created_at"> & { id?: string }): Promise<DBProviderTransaction> {
      const now = new Date().toISOString();
      const id = tx.id || crypto.randomUUID();

      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          const { data, error } = await supabase
            .from("provider_transactions")
            .upsert(
              { ...tx, id, created_at: now },
              { onConflict: "connection_id,provider_transaction_id" }
            )
            .select()
            .single();
          if (!error && data) return data as DBProviderTransaction;
        } catch {}
      }

      const existingIndex = memoryStore.providerTransactions.findIndex(
        t => t.connection_id === tx.connection_id && t.provider_transaction_id === tx.provider_transaction_id
      );

      if (existingIndex >= 0) {
        const updated = { ...memoryStore.providerTransactions[existingIndex], ...tx };
        memoryStore.providerTransactions[existingIndex] = updated;
        return updated;
      } else {
        const newTx: DBProviderTransaction = { id, created_at: now, ...tx };
        memoryStore.providerTransactions.push(newTx);
        return newTx;
      }
    },

    async listByConnection(connectionId: string, limit = 50): Promise<DBProviderTransaction[]> {
      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          const { data, error } = await supabase
            .from("provider_transactions")
            .select("*")
            .eq("connection_id", connectionId)
            .order("transaction_time", { ascending: false })
            .limit(limit);
          if (!error && data) return data as DBProviderTransaction[];
        } catch {}
      }

      return memoryStore.providerTransactions
        .filter(t => t.connection_id === connectionId)
        .sort((a, b) => new Date(b.transaction_time).getTime() - new Date(a.transaction_time).getTime())
        .slice(0, limit);
    },

    async listUnmatched(connectionId: string): Promise<DBProviderTransaction[]> {
      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          const { data, error } = await supabase
            .from("provider_transactions")
            .select("*")
            .eq("connection_id", connectionId)
            .eq("match_status", "UNMATCHED")
            .eq("transaction_status", "SUCCESS");
          if (!error && data) return data as DBProviderTransaction[];
        } catch {}
      }

      return memoryStore.providerTransactions.filter(
        t => t.connection_id === connectionId && t.match_status === "UNMATCHED" && t.transaction_status === "SUCCESS"
      );
    },

    async markMatched(id: string, orderId: string, status: "MATCHED" | "CONFLICT" = "MATCHED") {
      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          await supabase
            .from("provider_transactions")
            .update({ matched_order_id: orderId, match_status: status })
            .eq("id", id);
          return;
        } catch {}
      }

      const tx = memoryStore.providerTransactions.find(t => t.id === id);
      if (tx) {
        tx.matched_order_id = orderId;
        tx.match_status = status;
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
      const record: DBApiKey = {
        id,
        created_at: now,
        last_used_at: null,
        revoked_at: null,
        ...key,
      };

      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          const { data, error } = await supabase.from("api_keys").insert(record).select().single();
          if (!error && data) return data as DBApiKey;
        } catch {}
      }

      memoryStore.apiKeys.push(record);
      return record;
    },

    async findByHash(keyHash: string): Promise<DBApiKey | null> {
      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          const { data, error } = await supabase
            .from("api_keys")
            .select("*")
            .eq("key_hash", keyHash)
            .maybeSingle();
          if (!error && data) return data as DBApiKey;
        } catch {}
      }

      return memoryStore.apiKeys.find(k => k.key_hash === keyHash) || null;
    },

    async listByOwner(ownerId: string): Promise<DBApiKey[]> {
      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          const { data, error } = await supabase
            .from("api_keys")
            .select("*")
            .eq("owner_id", ownerId)
            .order("created_at", { ascending: false });
          if (!error && data) return data as DBApiKey[];
        } catch {}
      }

      return memoryStore.apiKeys
        .filter(k => k.owner_id === ownerId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },

    async revoke(id: string, ownerId: string): Promise<boolean> {
      const now = new Date().toISOString();
      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          const { error } = await supabase
            .from("api_keys")
            .update({ revoked_at: now })
            .eq("id", id)
            .eq("owner_id", ownerId);
          return !error;
        } catch {}
      }

      const key = memoryStore.apiKeys.find(k => k.id === id && k.owner_id === ownerId);
      if (key) {
        key.revoked_at = now;
        return true;
      }
      return false;
    },

    async updateLastUsed(id: string): Promise<void> {
      const now = new Date().toISOString();
      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          await supabase.from("api_keys").update({ last_used_at: now }).eq("id", id);
          return;
        } catch {}
      }

      const key = memoryStore.apiKeys.find(k => k.id === id);
      if (key) key.last_used_at = now;
    },
  },

  // -------------------------------------------------------------
  // Webhook Endpoints & Deliveries
  // -------------------------------------------------------------
  webhooks: {
    async createEndpoint(endpoint: Omit<DBWebhookEndpoint, "id" | "created_at" | "updated_at">): Promise<DBWebhookEndpoint> {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const record: DBWebhookEndpoint = { id, created_at: now, updated_at: now, ...endpoint };

      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          const { data, error } = await supabase.from("webhook_endpoints").insert(record).select().single();
          if (!error && data) return data as DBWebhookEndpoint;
        } catch {}
      }

      memoryStore.webhookEndpoints.push(record);
      return record;
    },

    async listEndpoints(ownerId: string): Promise<DBWebhookEndpoint[]> {
      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          const { data, error } = await supabase
            .from("webhook_endpoints")
            .select("*")
            .eq("owner_id", ownerId)
            .order("created_at", { ascending: false });
          if (!error && data) return data as DBWebhookEndpoint[];
        } catch {}
      }

      return memoryStore.webhookEndpoints.filter(e => e.owner_id === ownerId);
    },

    async deleteEndpoint(id: string, ownerId: string): Promise<boolean> {
      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          const { error } = await supabase.from("webhook_endpoints").delete().eq("id", id).eq("owner_id", ownerId);
          return !error;
        } catch {}
      }

      const idx = memoryStore.webhookEndpoints.findIndex(e => e.id === id && e.owner_id === ownerId);
      if (idx >= 0) {
        memoryStore.webhookEndpoints.splice(idx, 1);
        return true;
      }
      return false;
    },

    async createEvent(event: Omit<DBWebhookEvent, "id" | "created_at">): Promise<DBWebhookEvent> {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const record: DBWebhookEvent = { id, created_at: now, ...event };

      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          const { data, error } = await supabase.from("webhook_events").insert(record).select().single();
          if (!error && data) return data as DBWebhookEvent;
        } catch {}
      }

      memoryStore.webhookEvents.push(record);
      return record;
    },

    async listEvents(ownerId: string, limit = 50): Promise<DBWebhookEvent[]> {
      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          const { data, error } = await supabase
            .from("webhook_events")
            .select("*")
            .eq("owner_id", ownerId)
            .order("created_at", { ascending: false })
            .limit(limit);
          if (!error && data) return data as DBWebhookEvent[];
        } catch {}
      }

      return memoryStore.webhookEvents
        .filter(e => e.owner_id === ownerId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, limit);
    },

    async recordDelivery(delivery: Omit<DBWebhookDelivery, "id" | "created_at">): Promise<DBWebhookDelivery> {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const record: DBWebhookDelivery = { id, created_at: now, ...delivery };

      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          const { data, error } = await supabase.from("webhook_deliveries").insert(record).select().single();
          if (!error && data) return data as DBWebhookDelivery;
        } catch {}
      }

      memoryStore.webhookDeliveries.push(record);
      return record;
    },

    async listDeliveries(endpointId: string, limit = 50): Promise<DBWebhookDelivery[]> {
      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          const { data, error } = await supabase
            .from("webhook_deliveries")
            .select("*")
            .eq("endpoint_id", endpointId)
            .order("created_at", { ascending: false })
            .limit(limit);
          if (!error && data) return data as DBWebhookDelivery[];
        } catch {}
      }

      return memoryStore.webhookDeliveries
        .filter(d => d.endpoint_id === endpointId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, limit);
    },
  },

  // -------------------------------------------------------------
  // Idempotency
  // -------------------------------------------------------------
  idempotency: {
    async get(ownerId: string, idempotencyKey: string): Promise<DBIdempotencyRecord | null> {
      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          const { data, error } = await supabase
            .from("idempotency_records")
            .select("*")
            .eq("owner_id", ownerId)
            .eq("idempotency_key", idempotencyKey)
            .maybeSingle();
          if (!error && data) return data as DBIdempotencyRecord;
        } catch {}
      }

      return memoryStore.idempotencyRecords.find(
        r => r.owner_id === ownerId && r.idempotency_key === idempotencyKey
      ) || null;
    },

    async create(record: Omit<DBIdempotencyRecord, "id" | "created_at">): Promise<DBIdempotencyRecord> {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const newRec: DBIdempotencyRecord = { id, created_at: now, ...record };

      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          const { data, error } = await supabase.from("idempotency_records").insert(newRec).select().single();
          if (!error && data) return data as DBIdempotencyRecord;
        } catch {}
      }

      memoryStore.idempotencyRecords.push(newRec);
      return newRec;
    },

    async complete(
      ownerId: string,
      idempotencyKey: string,
      responseCode: number,
      responseBody: any,
      resourceId?: string
    ): Promise<void> {
      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          await supabase
            .from("idempotency_records")
            .update({
              status: "COMPLETED",
              response_code: responseCode,
              response_body: responseBody,
              resource_id: resourceId,
            })
            .eq("owner_id", ownerId)
            .eq("idempotency_key", idempotencyKey);
          return;
        } catch {}
      }

      const rec = memoryStore.idempotencyRecords.find(
        r => r.owner_id === ownerId && r.idempotency_key === idempotencyKey
      );
      if (rec) {
        rec.status = "COMPLETED";
        rec.response_code = responseCode;
        rec.response_body = responseBody;
        rec.resource_id = resourceId || null;
      }
    },
  },

  // -------------------------------------------------------------
  // Sync Cursors
  // -------------------------------------------------------------
  cursors: {
    async get(connectionId: string): Promise<DBSyncCursor | null> {
      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          const { data, error } = await supabase
            .from("sync_cursors")
            .select("*")
            .eq("connection_id", connectionId)
            .maybeSingle();
          if (!error && data) return data as DBSyncCursor;
        } catch {}
      }

      return memoryStore.syncCursors.find(c => c.connection_id === connectionId) || null;
    },

    async update(connectionId: string, provider: string, cursor: string | null, syncTime: string): Promise<void> {
      const now = new Date().toISOString();
      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          await supabase.from("sync_cursors").upsert({
            connection_id: connectionId,
            provider,
            last_cursor: cursor,
            last_sync_time: syncTime,
            updated_at: now,
          }, { onConflict: "connection_id" });
          return;
        } catch {}
      }

      const existing = memoryStore.syncCursors.find(c => c.connection_id === connectionId);
      if (existing) {
        existing.last_cursor = cursor;
        existing.last_sync_time = syncTime;
        existing.updated_at = now;
      } else {
        memoryStore.syncCursors.push({
          id: crypto.randomUUID(),
          connection_id: connectionId,
          provider,
          last_cursor: cursor,
          last_sync_time: syncTime,
          updated_at: now,
        });
      }
    },
  },

  // -------------------------------------------------------------
  // Audit Logs
  // -------------------------------------------------------------
  audit: {
    async log(action: string, ownerId: string | null, details: any, ipAddress?: string | null): Promise<void> {
      const record: DBAuditLog = {
        id: crypto.randomUUID(),
        owner_id: ownerId,
        action,
        details,
        ip_address: ipAddress || null,
        created_at: new Date().toISOString(),
      };

      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          await supabase.from("audit_logs").insert(record);
          return;
        } catch {}
      }

      memoryStore.auditLogs.push(record);
    },

    async list(ownerId?: string, limit = 50): Promise<DBAuditLog[]> {
      if (hasSupabaseConfig) {
        try {
          const supabase = createAdminClient();
          let query = supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(limit);
          if (ownerId) query = query.eq("owner_id", ownerId);
          const { data, error } = await query;
          if (!error && data) return data as DBAuditLog[];
        } catch {}
      }

      let logs = memoryStore.auditLogs;
      if (ownerId) logs = logs.filter(l => l.owner_id === ownerId);
      return logs.slice().reverse().slice(0, limit);
    },
  },
};
