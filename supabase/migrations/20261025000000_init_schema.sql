-- ============================================================
-- QRIS Payment Gateway Platform - Initial Migration
-- ============================================================

-- Enable pgcrypto for UUID generation if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Merchant Connections
CREATE TABLE IF NOT EXISTS public.merchant_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'gobiz',
    merchant_id TEXT,
    merchant_name TEXT,
    country_code TEXT NOT NULL DEFAULT '62',
    phone_masked TEXT,
    access_token_enc JSONB,
    refresh_token_enc JSONB,
    token_expires_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'NOT_CONNECTED' CHECK (status IN (
        'NOT_CONNECTED',
        'OTP_PENDING',
        'CONNECTED',
        'TOKEN_EXPIRED',
        'REAUTH_REQUIRED',
        'CONNECTION_ERROR'
    )),
    last_sync_at TIMESTAMPTZ,
    last_error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_merchant_connections_owner ON public.merchant_connections(owner_id);
CREATE INDEX IF NOT EXISTS idx_merchant_connections_status ON public.merchant_connections(status);

-- 3. Payment Orders
CREATE TABLE IF NOT EXISTS public.payment_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    connection_id UUID REFERENCES public.merchant_connections(id) ON DELETE SET NULL,
    provider_payment_id TEXT,
    external_id TEXT NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'IDR',
    description TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING',
        'PAID',
        'EXPIRED',
        'CANCELLED',
        'FAILED',
        'NEEDS_REVIEW'
    )),
    qr_string TEXT,
    qr_payload_enc JSONB,
    payment_window_start TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    payment_window_end TIMESTAMPTZ,
    matched_transaction_id UUID,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_payment_orders_owner_external_id UNIQUE (owner_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_owner ON public.payment_orders(owner_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON public.payment_orders(status);
CREATE INDEX IF NOT EXISTS idx_payment_orders_created ON public.payment_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_orders_provider_id ON public.payment_orders(provider_payment_id);

-- 4. Provider Transactions
CREATE TABLE IF NOT EXISTS public.provider_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES public.merchant_connections(id) ON DELETE CASCADE,
    provider_transaction_id TEXT NOT NULL,
    merchant_id TEXT NOT NULL,
    payable_amount BIGINT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'IDR',
    transaction_status TEXT NOT NULL,
    transaction_time TIMESTAMPTZ NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('GOBIZ_ANALYTICS', 'MOCK', 'CSV_IMPORT', 'WEBHOOK')),
    raw_payload JSONB,
    matched_order_id UUID REFERENCES public.payment_orders(id) ON DELETE SET NULL,
    match_status TEXT NOT NULL DEFAULT 'UNMATCHED' CHECK (match_status IN ('UNMATCHED', 'MATCHED', 'CONFLICT', 'IGNORED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_provider_tx_conn_provider_id UNIQUE (connection_id, provider_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_tx_conn ON public.provider_transactions(connection_id);
CREATE INDEX IF NOT EXISTS idx_provider_tx_time ON public.provider_transactions(transaction_time DESC);
CREATE INDEX IF NOT EXISTS idx_provider_tx_match ON public.provider_transactions(match_status);

-- 5. API Keys
CREATE TABLE IF NOT EXISTS public.api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
    permissions JSONB NOT NULL DEFAULT '["payments:read", "payments:write"]'::jsonb,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON public.api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_owner ON public.api_keys(owner_id);

-- 6. Webhook Endpoints
CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    signing_secret_enc JSONB NOT NULL,
    signing_secret_preview TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_owner ON public.webhook_endpoints(owner_id);

-- 7. Webhook Events
CREATE TABLE IF NOT EXISTS public.webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    resource_id UUID,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_owner ON public.webhook_events(owner_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON public.webhook_events(created_at DESC);

-- 8. Webhook Deliveries
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id UUID NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES public.webhook_events(id) ON DELETE CASCADE,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    http_status INTEGER,
    response_excerpt TEXT,
    error_message TEXT,
    next_attempt_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint ON public.webhook_deliveries(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_next_attempt ON public.webhook_deliveries(next_attempt_at) WHERE delivered_at IS NULL;

-- 9. Idempotency Records
CREATE TABLE IF NOT EXISTS public.idempotency_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED')),
    response_code INTEGER,
    response_body JSONB,
    resource_id UUID,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_idempotency_owner_key UNIQUE (owner_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON public.idempotency_records(expires_at);

-- 10. Sync Cursors
CREATE TABLE IF NOT EXISTS public.sync_cursors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES public.merchant_connections(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    last_cursor TEXT,
    last_sync_time TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_sync_cursors_conn UNIQUE (connection_id)
);

-- 11. Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_owner ON public.audit_logs(owner_id);

-- ============================================================
-- Row Level Security (RLS) Setup
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can select/update only their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Merchant Connections
CREATE POLICY "Users can manage own merchant connections" ON public.merchant_connections
    FOR ALL USING (auth.uid() = owner_id);

-- Payment Orders
CREATE POLICY "Users can manage own payment orders" ON public.payment_orders
    FOR ALL USING (auth.uid() = owner_id);

-- Provider Transactions (read-only for owner through connection_id)
CREATE POLICY "Users can view transactions from their connections" ON public.provider_transactions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.merchant_connections mc
            WHERE mc.id = provider_transactions.connection_id
            AND mc.owner_id = auth.uid()
        )
    );

-- API Keys
CREATE POLICY "Users can manage own API keys" ON public.api_keys
    FOR ALL USING (auth.uid() = owner_id);

-- Webhook Endpoints
CREATE POLICY "Users can manage own webhook endpoints" ON public.webhook_endpoints
    FOR ALL USING (auth.uid() = owner_id);

-- Webhook Events
CREATE POLICY "Users can view own webhook events" ON public.webhook_events
    FOR SELECT USING (auth.uid() = owner_id);

-- Webhook Deliveries
CREATE POLICY "Users can view deliveries for their endpoints" ON public.webhook_deliveries
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.webhook_endpoints we
            WHERE we.id = webhook_deliveries.endpoint_id
            AND we.owner_id = auth.uid()
        )
    );

-- Idempotency Records
CREATE POLICY "Users can manage own idempotency records" ON public.idempotency_records
    FOR ALL USING (auth.uid() = owner_id);

-- Audit Logs
CREATE POLICY "Users can view own audit logs" ON public.audit_logs
    FOR SELECT USING (auth.uid() = owner_id);

-- Trigger for creating user profile on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
