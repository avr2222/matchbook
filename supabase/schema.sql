-- ============================================================
-- Matchbook — Supabase Schema
-- Run this once in the Supabase SQL editor.
-- ============================================================

-- ── Tournaments ───────────────────────────────────────────────────────────
CREATE TABLE tournaments (
  id                       TEXT PRIMARY KEY,
  name                     TEXT NOT NULL,
  short_name               TEXT NOT NULL,
  cricheroes_tournament_id TEXT DEFAULT '',
  cricheroes_url           TEXT DEFAULT '',
  start_date               DATE,
  end_date                 DATE,
  status                   TEXT DEFAULT 'active',
  opening_balances         JSONB DEFAULT '{}',
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

-- ── Players ───────────────────────────────────────────────────────────────
CREATE TABLE players (
  id                     TEXT PRIMARY KEY,
  display_name           TEXT NOT NULL,
  type                   TEXT NOT NULL,
  status                 TEXT DEFAULT 'active',
  joined_date            DATE,
  phone                  TEXT DEFAULT '',
  github_username        TEXT DEFAULT '',
  cricheroes_player_id   TEXT DEFAULT '',
  cricheroes_name        TEXT DEFAULT '',
  guest_fee_mode         TEXT,
  sponsored_by_player_id TEXT REFERENCES players(id),
  notes                  TEXT DEFAULT '',
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ── Weeks ─────────────────────────────────────────────────────────────────
CREATE TABLE weeks (
  week_id              TEXT PRIMARY KEY,
  tournament_id        TEXT REFERENCES tournaments(id),
  match_date           DATE NOT NULL,
  label                TEXT NOT NULL,
  venue                TEXT DEFAULT '',
  match_fee            NUMERIC(10,2),
  total_cost           NUMERIC(10,2),
  corpus_present       INTEGER DEFAULT 0,
  total_present        INTEGER DEFAULT 0,
  players_count        INTEGER DEFAULT 0,
  status               TEXT DEFAULT 'scheduled',
  cricheroes_match_id  TEXT,
  cricheroes_match_ids TEXT[] DEFAULT '{}',
  team_a               TEXT DEFAULT '',
  team_b               TEXT DEFAULT '',
  result               TEXT DEFAULT '',
  notes                TEXT DEFAULT '',
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ── Transactions ──────────────────────────────────────────────────────────
CREATE TABLE transactions (
  id            TEXT PRIMARY KEY,
  player_id     TEXT REFERENCES players(id),
  tournament_id TEXT REFERENCES tournaments(id),
  type          TEXT NOT NULL,
  amount        NUMERIC(10,2) NOT NULL,
  direction     TEXT NOT NULL,
  date          DATE NOT NULL,
  week_id       TEXT REFERENCES weeks(week_id) ON DELETE SET NULL,
  description   TEXT DEFAULT '',
  recorded_by   TEXT DEFAULT '',
  receipt_ref   TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Expenses ──────────────────────────────────────────────────────────────
CREATE TABLE expenses (
  id                TEXT PRIMARY KEY,
  tournament_id     TEXT REFERENCES tournaments(id),
  date              DATE NOT NULL,
  category          TEXT NOT NULL,
  amount            NUMERIC(10,2) NOT NULL,
  description       TEXT DEFAULT '',
  paid_by           TEXT DEFAULT '',
  paid_by_player_id TEXT REFERENCES players(id),
  share_per_player  NUMERIC(10,2),
  split_among       TEXT DEFAULT 'all_corpus',
  week_id           TEXT REFERENCES weeks(week_id) ON DELETE SET NULL,
  recorded_by       TEXT DEFAULT '',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Attendance ────────────────────────────────────────────────────────────
CREATE TABLE attendance (
  id                TEXT PRIMARY KEY,
  player_id         TEXT REFERENCES players(id),
  week_id           TEXT REFERENCES weeks(week_id) ON DELETE CASCADE,
  tournament_id     TEXT REFERENCES tournaments(id),
  status            TEXT NOT NULL,
  source            TEXT DEFAULT '',
  fee_deducted      BOOLEAN DEFAULT FALSE,
  sponsor_player_id TEXT REFERENCES players(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, week_id)
);

-- ── Config (single row) ───────────────────────────────────────────────────
CREATE TABLE config (
  id                        INTEGER PRIMARY KEY DEFAULT 1,
  team_name                 TEXT DEFAULT 'MatchBook',
  currency                  TEXT DEFAULT 'INR',
  currency_symbol           TEXT DEFAULT '₹',
  default_match_fee         NUMERIC(10,2) DEFAULT 4688,
  default_ppm_rate          NUMERIC(10,2) DEFAULT 300,
  default_guest_fee         NUMERIC(10,2) DEFAULT 300,
  corpus_low_threshold      NUMERIC(10,2) DEFAULT 1000,
  corpus_urgent_threshold   NUMERIC(10,2) DEFAULT 500,
  corpus_overdue_threshold  NUMERIC(10,2) DEFAULT 0,
  active_tournament_id      TEXT REFERENCES tournaments(id),
  cricheroes_tournament_id  TEXT DEFAULT '',
  cricheroes_tournament_url TEXT DEFAULT '',
  auto_deduct_on_sync       BOOLEAN DEFAULT TRUE,
  admin_upi_id              TEXT DEFAULT '',
  season_budget             NUMERIC(10,2) DEFAULT 0,
  CONSTRAINT single_row CHECK (id = 1)
);

-- ── Audit Log ─────────────────────────────────────────────────────────────
CREATE TABLE audit_log (
  id           TEXT PRIMARY KEY,
  timestamp    TIMESTAMPTZ DEFAULT NOW(),
  actor        TEXT NOT NULL,
  actor_role   TEXT DEFAULT 'unknown',
  action       TEXT NOT NULL,
  entity_type  TEXT,
  entity_id    TEXT,
  summary      TEXT,
  before_state JSONB,
  after_state  JSONB
);

-- ── Announcements ─────────────────────────────────────────────────────────
CREATE TABLE announcements (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  posted_on  DATE DEFAULT CURRENT_DATE,
  expires_on DATE,
  pinned     BOOLEAN DEFAULT FALSE,
  posted_by  TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Guest Visits ──────────────────────────────────────────────────────────
CREATE TABLE guest_visits (
  id                TEXT PRIMARY KEY,
  player_id         TEXT REFERENCES players(id),
  week_id           TEXT REFERENCES weeks(week_id) ON DELETE CASCADE,
  visit_date        DATE,
  status            TEXT DEFAULT 'attended',
  sponsor_player_id TEXT REFERENCES players(id),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Payment Requests ──────────────────────────────────────────────────────
CREATE TABLE payment_requests (
  id           TEXT PRIMARY KEY,
  player_id    TEXT REFERENCES players(id),
  amount       NUMERIC(10,2),
  upi_ref      TEXT DEFAULT '',
  status       TEXT DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  submitted_on DATE,
  reviewed_on  DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  paid_at      TIMESTAMPTZ,
  notes        TEXT DEFAULT ''
);

-- ── CricHeroes Mapping (single-row JSONB store) ───────────────────────────
CREATE TABLE cricheroes_mapping (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  mapping    JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO cricheroes_mapping(id) VALUES (1) ON CONFLICT DO NOTHING;

-- ============================================================
-- Computed view — player balances (replaces stored fields)
-- corpus_balance, total_paid, total_deducted are derived live
-- from the transactions table; balance_status is still computed
-- client-side from config thresholds.
-- ============================================================
CREATE VIEW player_balances AS
SELECT
  p.*,
  COALESCE(SUM(CASE WHEN t.direction = 'credit' THEN t.amount ELSE 0        END), 0) AS total_paid,
  COALESCE(SUM(CASE WHEN t.direction = 'debit'  THEN t.amount ELSE 0        END), 0) AS total_deducted,
  COALESCE(SUM(CASE WHEN t.direction = 'credit' THEN t.amount ELSE -t.amount END), 0) AS corpus_balance
FROM players p
LEFT JOIN transactions t ON t.player_id = p.id
GROUP BY p.id;

-- ============================================================
-- Performance indexes
-- ============================================================
CREATE INDEX idx_txn_player     ON transactions(player_id);
CREATE INDEX idx_txn_week       ON transactions(week_id);
CREATE INDEX idx_txn_tournament ON transactions(tournament_id);
CREATE INDEX idx_att_player     ON attendance(player_id);
CREATE INDEX idx_att_week       ON attendance(week_id);
CREATE INDEX idx_exp_tournament ON expenses(tournament_id);
CREATE INDEX idx_wk_tournament  ON weeks(tournament_id);
CREATE INDEX idx_audit_ts       ON audit_log(timestamp DESC);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE tournaments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE players           ENABLE ROW LEVEL SECURITY;
ALTER TABLE weeks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance        ENABLE ROW LEVEL SECURITY;
ALTER TABLE config            ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_visits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cricheroes_mapping ENABLE ROW LEVEL SECURITY;

-- Helper: true when the caller's JWT has is_admin=true in user_metadata
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean,
    false
  );
$$;

-- Public SELECT on every table (team app — nothing sensitive in data)
CREATE POLICY public_read ON tournaments       FOR SELECT USING (true);
CREATE POLICY public_read ON players          FOR SELECT USING (true);
CREATE POLICY public_read ON weeks            FOR SELECT USING (true);
CREATE POLICY public_read ON transactions     FOR SELECT USING (true);
CREATE POLICY public_read ON expenses         FOR SELECT USING (true);
CREATE POLICY public_read ON attendance       FOR SELECT USING (true);
CREATE POLICY public_read ON config           FOR SELECT USING (true);
CREATE POLICY public_read ON audit_log        FOR SELECT USING (true);
CREATE POLICY public_read ON announcements    FOR SELECT USING (true);
CREATE POLICY public_read ON guest_visits     FOR SELECT USING (true);
CREATE POLICY public_read ON payment_requests FOR SELECT USING (true);
CREATE POLICY public_read ON cricheroes_mapping FOR SELECT USING (true);

-- Admin write on every table
DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'tournaments','players','weeks','transactions','expenses','attendance',
    'config','audit_log','announcements','guest_visits','payment_requests',
    'cricheroes_mapping'
  ]) LOOP
    EXECUTE format(
      'CREATE POLICY admin_write ON %I FOR ALL USING (is_admin()) WITH CHECK (is_admin())', t
    );
  END LOOP;
END $$;

-- ============================================================
-- After running this file:
-- 1. Auth → Users → create your admin account
-- 2. Run this SQL to grant admin:
--    UPDATE auth.users
--    SET raw_user_meta_data = raw_user_meta_data || '{"is_admin": true}'::jsonb
--    WHERE email = 'your@email.com';
-- 3. Run scripts/migrate_json_to_supabase.py to import data
-- ============================================================
