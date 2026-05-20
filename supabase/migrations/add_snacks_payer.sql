ALTER TABLE config ADD COLUMN IF NOT EXISTS default_snacks_payer_id TEXT REFERENCES players(id);
