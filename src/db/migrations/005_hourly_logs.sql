-- Hourly production logs for efficiency tracking
CREATE TABLE hourly_logs (
  id          INTEGER PRIMARY KEY,
  line_id     INTEGER NOT NULL,
  hour        INTEGER NOT NULL CHECK (hour BETWEEN 1 AND 24),
  qty         INTEGER NOT NULL CHECK (qty >= 0),
  created_at  TEXT NOT NULL,
  created_by  INTEGER NOT NULL REFERENCES users(id)
) STRICT;
