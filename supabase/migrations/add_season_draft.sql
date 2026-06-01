-- Season Draft: player roles + team assignment table
-- Run in Supabase SQL Editor before deploying the draft feature.

-- 1. Permanent cricket role per player (set once by admin, reused across seasons)
ALTER TABLE players ADD COLUMN IF NOT EXISTS player_role TEXT DEFAULT NULL;
-- Valid values: 'batsman' | 'batting_ar' | 'bat_wk' | 'bowling_ar'
-- Captain & Umpire interest are tracked per-season in season_squads (captain_interest / umpire_interest)

-- 2. Per-season team assignment
CREATE TABLE IF NOT EXISTS season_squads (
  id               TEXT PRIMARY KEY,      -- SQUAD_{tournament_id}_{player_id}
  tournament_id    TEXT REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id        TEXT REFERENCES players(id),
  team             TEXT NOT NULL,         -- 'A' | 'B'
  is_captain       BOOLEAN DEFAULT false,
  is_umpire        BOOLEAN DEFAULT false,
  captain_interest BOOLEAN DEFAULT false, -- admin-marked: player wants to captain
  umpire_interest  BOOLEAN DEFAULT false, -- admin-marked: player willing to umpire
  draft_order      INTEGER,               -- global position in reveal sequence
  reveal_group     TEXT,                  -- 'bat_wk'|'batsman'|'batting_ar'|'bowling_ar'|'umpire'|'captain'
  published        BOOLEAN DEFAULT false, -- true = /teams page becomes accessible
  revealed         BOOLEAN DEFAULT false, -- true = this card has been flipped live
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tournament_id, player_id)
);

ALTER TABLE season_squads ENABLE ROW LEVEL SECURITY;

CREATE POLICY squad_public_read ON season_squads
  FOR SELECT USING (true);

CREATE POLICY squad_admin_write ON season_squads
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

GRANT SELECT ON public.season_squads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.season_squads TO authenticated;
GRANT ALL ON public.season_squads TO service_role;

CREATE INDEX IF NOT EXISTS idx_squads_tournament ON season_squads(tournament_id);
CREATE INDEX IF NOT EXISTS idx_squads_player     ON season_squads(player_id);

-- 3. Enable Realtime on season_squads so the /teams live reveal works.
--    Run this separately if the table isn't already in the publication:
--    ALTER PUBLICATION supabase_realtime ADD TABLE season_squads;
