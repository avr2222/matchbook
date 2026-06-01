-- Drop the wrong UNIQUE(player_id, week_id) constraint.
-- The sync inserts one row per player per MATCH (not per week), so multiple
-- rows per player per week must be allowed. The primary key (PERF_{player}_{match})
-- already guarantees uniqueness per player per match.
ALTER TABLE match_performances
  DROP CONSTRAINT IF EXISTS match_performances_player_id_week_id_key;

-- Add cricheroes_match_id column (sync writes this; may already exist in prod)
ALTER TABLE match_performances
  ADD COLUMN IF NOT EXISTS cricheroes_match_id TEXT;
