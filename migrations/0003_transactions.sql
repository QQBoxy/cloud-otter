CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item TEXT NOT NULL CHECK (length(item) BETWEEN 1 AND 500),
  amount_cents INTEGER NOT NULL CHECK (amount_cents BETWEEN 1 AND 999999999999),
  occurred_at TEXT NOT NULL,
  taipei_month TEXT NOT NULL,
  legacy_id TEXT UNIQUE,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
);

CREATE INDEX transactions_month ON transactions (deleted, taipei_month, occurred_at, id);
