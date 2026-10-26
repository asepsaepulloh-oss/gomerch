-- ============================================================
-- Direct PostgreSQL Migration (Independent from Supabase Auth)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- App Users Table (Direct Auth via PostgreSQL)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- Drop auth.users FK constraints if exist and re-point to public.users
ALTER TABLE IF EXISTS public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE IF EXISTS public.merchant_connections DROP CONSTRAINT IF EXISTS merchant_connections_owner_id_fkey;
ALTER TABLE IF EXISTS public.payment_orders DROP CONSTRAINT IF EXISTS payment_orders_owner_id_fkey;
ALTER TABLE IF EXISTS public.api_keys DROP CONSTRAINT IF EXISTS api_keys_owner_id_fkey;
ALTER TABLE IF EXISTS public.webhook_endpoints DROP CONSTRAINT IF EXISTS webhook_endpoints_owner_id_fkey;
ALTER TABLE IF EXISTS public.webhook_events DROP CONSTRAINT IF EXISTS webhook_events_owner_id_fkey;
ALTER TABLE IF EXISTS public.idempotency_records DROP CONSTRAINT IF EXISTS idempotency_records_owner_id_fkey;
ALTER TABLE IF EXISTS public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_owner_id_fkey;

-- Re-add Foreign Keys to public.users
ALTER TABLE IF EXISTS public.merchant_connections 
    ADD CONSTRAINT merchant_connections_owner_id_fkey 
    FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.payment_orders 
    ADD CONSTRAINT payment_orders_owner_id_fkey 
    FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.api_keys 
    ADD CONSTRAINT api_keys_owner_id_fkey 
    FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.webhook_endpoints 
    ADD CONSTRAINT webhook_endpoints_owner_id_fkey 
    FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.webhook_events 
    ADD CONSTRAINT webhook_events_owner_id_fkey 
    FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.idempotency_records 
    ADD CONSTRAINT idempotency_records_owner_id_fkey 
    FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.audit_logs 
    ADD CONSTRAINT audit_logs_owner_id_fkey 
    FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE SET NULL;
