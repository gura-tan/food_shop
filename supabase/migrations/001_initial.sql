-- ============================================================
-- Food Stall Order Management System - Initial Schema
-- ============================================================

-- Settings (key-value store)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('ticket_max',          '15'),
  ('next_ticket_number',  '1')
ON CONFLICT (key) DO NOTHING;

-- Menus
CREATE TABLE IF NOT EXISTS menus (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT    NOT NULL,
  price      INTEGER NOT NULL CHECK (price >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id          SERIAL PRIMARY KEY,  -- = 注文番号
  ticket_number INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'ordering'
              CHECK (status IN ('ordering','billing','cooking','delivering','completed')),
  device_name TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Order Items
CREATE TABLE IF NOT EXISTS order_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_id    UUID    REFERENCES menus(id) ON DELETE SET NULL,
  menu_name  TEXT    NOT NULL,
  unit_price INTEGER NOT NULL,
  quantity   INTEGER NOT NULL CHECK (quantity > 0)
);

-- Tickets
CREATE TABLE IF NOT EXISTS tickets (
  number   INTEGER PRIMARY KEY,
  status   TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused','in_use')),
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL
);

-- Initialize 15 tickets
DO $$
BEGIN
  FOR i IN 1..15 LOOP
    INSERT INTO tickets (number) VALUES (i) ON CONFLICT (number) DO NOTHING;
  END LOOP;
END $$;

-- Logs
CREATE TABLE IF NOT EXISTS logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_name TEXT NOT NULL,
  action      TEXT NOT NULL,
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Updated_at trigger for orders
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Enable Realtime for relevant tables
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE settings;
ALTER PUBLICATION supabase_realtime ADD TABLE tickets;
