-- Match Performances — run once in Supabase SQL Editor.
-- Stores per-player per-session batting/bowling/fielding stats
-- populated automatically by scripts/sync_cricheroes.py

CREATE TABLE IF NOT EXISTS match_performances (
  id            TEXT PRIMARY KEY,
  player_id     TEXT REFERENCES players(id),
  week_id       TEXT REFERENCES weeks(week_id) ON DELETE CASCADE,
  tournament_id TEXT REFERENCES tournaments(id),
  runs          INTEGER DEFAULT 0,
  balls_faced   INTEGER DEFAULT 0,
  fours         INTEGER DEFAULT 0,
  sixes         INTEGER DEFAULT 0,
  dismissal     TEXT DEFAULT '',
  batting_pos   INTEGER,
  wickets       INTEGER DEFAULT 0,
  runs_given    INTEGER DEFAULT 0,
  balls_bowled  INTEGER DEFAULT 0,
  maidens       INTEGER DEFAULT 0,
  catches       INTEGER DEFAULT 0,
  run_outs      INTEGER DEFAULT 0,
  stumpings     INTEGER DEFAULT 0,
  match_count   INTEGER DEFAULT 1,
  wides         INTEGER DEFAULT 0,
  no_balls      INTEGER DEFAULT 0,
  potm_count    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, week_id)
);

ALTER TABLE match_performances ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_read ON match_performances FOR SELECT USING (true);

CREATE POLICY admin_write ON match_performances
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

GRANT SELECT ON public.match_performances TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_performances TO authenticated;
GRANT ALL ON public.match_performances TO service_role;

CREATE INDEX IF NOT EXISTS idx_perf_player ON match_performances(player_id);
CREATE INDEX IF NOT EXISTS idx_perf_week   ON match_performances(week_id);
CREATE INDEX IF NOT EXISTS idx_perf_tourn  ON match_performances(tournament_id);
