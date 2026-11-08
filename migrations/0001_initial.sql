CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX sessions_expiry ON sessions (expires_at);

CREATE TABLE login_limits (
  account INTEGER PRIMARY KEY,
  window INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);

CREATE TABLE announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 500),
  position INTEGER NOT NULL
);
