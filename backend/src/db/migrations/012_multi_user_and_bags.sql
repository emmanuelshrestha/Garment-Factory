-- ---------------------------------------------------------------------------
-- Multi-user PIN Auth, Bag Inventory, and Cutting Records
-- ---------------------------------------------------------------------------

CREATE TABLE staff_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner', 'staff')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE bags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE bag_contents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bag_id INTEGER NOT NULL REFERENCES bags(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
  updated_at TEXT NOT NULL,
  UNIQUE(bag_id, variant_id)
) STRICT;

CREATE INDEX idx_bag_contents_variant ON bag_contents(variant_id);

CREATE TABLE cutting_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  size TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  cut_date TEXT NOT NULL,
  recorded_by_id INTEGER REFERENCES staff_users(id),
  created_at TEXT NOT NULL
) STRICT;
