-- Add ball_deliveries table for per-delivery CricHeroes commentary data
CREATE TABLE IF NOT EXISTS ball_deliveries (
  id                  TEXT PRIMARY KEY,   -- BALL_{match_id}_{innings}_{over}_{ball}
  cricheroes_match_id TEXT NOT NULL,
  week_id             TEXT REFERENCES weeks(week_id),
  tournament_id       TEXT REFERENCES tournaments(id),
  innings             INTEGER,
  batting_team        TEXT DEFAULT '',
  over_ball           TEXT DEFAULT '',    -- "10.3" format
  over_num            INTEGER,
  ball_num            INTEGER,
  bowler_name         TEXT DEFAULT '',
  bowler_id           TEXT REFERENCES players(id),
  batsman_name        TEXT DEFAULT '',
  batsman_id          TEXT REFERENCES players(id),
  runs                INTEGER DEFAULT 0,
  extra_type          TEXT DEFAULT '',    -- WD, NB, LB, B, or ''
  extra_runs          INTEGER DEFAULT 0,
  is_wicket           INTEGER DEFAULT 0,
  is_boundary         INTEGER DEFAULT 0,
  is_dot_ball         INTEGER DEFAULT 0,
  commentary          TEXT DEFAULT '',
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ball_deliveries_week       ON ball_deliveries(week_id);
CREATE INDEX IF NOT EXISTS idx_ball_deliveries_tournament ON ball_deliveries(tournament_id);
CREATE INDEX IF NOT EXISTS idx_ball_deliveries_bowler     ON ball_deliveries(bowler_id);
CREATE INDEX IF NOT EXISTS idx_ball_deliveries_batsman    ON ball_deliveries(batsman_id);
CREATE INDEX IF NOT EXISTS idx_ball_deliveries_match      ON ball_deliveries(cricheroes_match_id);

-- Enable public read (same policy as all other tables)
ALTER TABLE ball_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read ball_deliveries" ON ball_deliveries FOR SELECT USING (true);
CREATE POLICY "Admin write ball_deliveries" ON ball_deliveries FOR ALL USING (is_admin());

-- Fix missing columns on match_performances
ALTER TABLE match_performances ADD COLUMN IF NOT EXISTS ducks          INTEGER DEFAULT 0;
ALTER TABLE match_performances ADD COLUMN IF NOT EXISTS bba_count      INTEGER DEFAULT 0;
ALTER TABLE match_performances ADD COLUMN IF NOT EXISTS bbo_count      INTEGER DEFAULT 0;
ALTER TABLE match_performances ADD COLUMN IF NOT EXISTS won_match      INTEGER DEFAULT 0;
ALTER TABLE match_performances ADD COLUMN IF NOT EXISTS times_run_out  INTEGER DEFAULT 0;
