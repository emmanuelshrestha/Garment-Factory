-- Control plane database for multi-tenant garment factory platform
-- This holds the registry of factories, not the ledger data

CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,            -- Subdomain slug: 'acme', 'factory-one'
  name TEXT NOT NULL,                   -- Display name
  db_path TEXT NOT NULL,                -- Path to tenant's SQLite file
  plan TEXT NOT NULL DEFAULT 'free',    -- Billing plan
  is_active INTEGER NOT NULL DEFAULT 1, -- 1 = active, 0 = suspended
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS control_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,        -- Admin username
  password_hash TEXT NOT NULL,          -- scrypt hash
  email TEXT,                           -- Admin contact email
  full_name TEXT NOT NULL,              -- Display name
  is_active INTEGER NOT NULL DEFAULT 1, -- 1 = active, 0 = disabled
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
) STRICT;

-- Insert the platform admin (you)
INSERT INTO control_users (username, password_hash, full_name, email)
SELECT 'admin', '--placeholder--', 'Platform Administrator', 'admin@example.com'
WHERE NOT EXISTS (SELECT 1 FROM control_users WHERE username = 'admin');

-- Create a default tenant for testing
INSERT INTO tenants (slug, name, db_path)
SELECT 'demo', 'Demo Factory', 'data/tenants/demo.db'
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'demo');