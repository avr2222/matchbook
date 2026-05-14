-- ============================================================
-- Supabase Data API Grant Migration
-- Run this once in the SQL Editor to comply with the May/Oct 2026
-- change where public schema tables require explicit GRANTs.
-- RLS policies are unchanged — GRANTs determine PostgREST visibility,
-- RLS determines row-level access within that.
-- ============================================================

-- ── Per-role grants on all existing tables ────────────────────
-- anon: read-only (matches existing public_read RLS policies)
GRANT SELECT ON
  public.tournaments,
  public.players,
  public.weeks,
  public.transactions,
  public.expenses,
  public.attendance,
  public.config,
  public.audit_log,
  public.announcements,
  public.guest_visits,
  public.payment_requests,
  public.cricheroes_mapping
TO anon;

-- authenticated: full DML (RLS policies enforce row-level restrictions)
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.tournaments,
  public.players,
  public.weeks,
  public.transactions,
  public.expenses,
  public.attendance,
  public.config,
  public.audit_log,
  public.announcements,
  public.guest_visits,
  public.payment_requests,
  public.cricheroes_mapping
TO authenticated;

-- service_role: full access for edge functions
GRANT ALL ON
  public.tournaments,
  public.players,
  public.weeks,
  public.transactions,
  public.expenses,
  public.attendance,
  public.config,
  public.audit_log,
  public.announcements,
  public.guest_visits,
  public.payment_requests,
  public.cricheroes_mapping
TO service_role;

-- ── View: player_balances ──────────────────────────────────────
GRANT SELECT ON public.player_balances TO anon, authenticated, service_role;

-- ── Tables added outside schema.sql ───────────────────────────
-- user_signups (added via migrations)
GRANT SELECT ON public.user_signups TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_signups TO authenticated;
GRANT ALL ON public.user_signups TO service_role;

-- push_subscriptions (added via push_subscriptions.sql)
GRANT SELECT, INSERT, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

-- ── Default privileges — covers all future tables ─────────────
-- Any new table created in public schema will automatically get
-- these grants, matching the post-May-2026 Supabase requirement.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
