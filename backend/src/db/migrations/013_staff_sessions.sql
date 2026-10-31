CREATE TABLE staff_sessions (
  id            TEXT PRIMARY KEY,
  staff_user_id INTEGER NOT NULL REFERENCES staff_users(id),
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL
) STRICT;

CREATE INDEX idx_staff_sessions_user ON staff_sessions(staff_user_id);
