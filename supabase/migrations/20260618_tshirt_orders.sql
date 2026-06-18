-- T-shirt order submissions from players
CREATE TABLE tshirt_orders (
  id            TEXT PRIMARY KEY,
  jersey_name   TEXT NOT NULL,
  jersey_number TEXT NOT NULL,
  size          TEXT NOT NULL,       -- XS / S / M / L / XL / XXL
  sleeve_type   TEXT NOT NULL,       -- 'half' | 'full'
  player_id     TEXT REFERENCES players(id),
  notes         TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tshirt_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read tshirt_orders"   ON tshirt_orders FOR SELECT USING (true);
CREATE POLICY "public insert tshirt_orders" ON tshirt_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "admin delete tshirt_orders"  ON tshirt_orders FOR DELETE USING (is_admin());
