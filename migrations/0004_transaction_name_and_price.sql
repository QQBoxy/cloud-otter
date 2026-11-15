CREATE TABLE transactions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 500),
  price REAL NOT NULL CHECK (price BETWEEN 0.01 AND 9999999999.99),
  occurred_at TEXT NOT NULL,
  taipei_month TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
);

INSERT INTO transactions_new (id, name, price, occurred_at, taipei_month, deleted)
SELECT id, item, amount_cents / 100.0, occurred_at, taipei_month, deleted FROM transactions;

-- Preserve IDs already issued even if the highest transaction was deleted.
INSERT INTO sqlite_sequence (name, seq)
SELECT 'transactions_new', seq FROM sqlite_sequence
WHERE name = 'transactions' AND NOT EXISTS (
  SELECT 1 FROM sqlite_sequence WHERE name = 'transactions_new'
);

UPDATE sqlite_sequence SET seq = max(seq, coalesce((
  SELECT seq FROM sqlite_sequence WHERE name = 'transactions'
), 0)) WHERE name = 'transactions_new';

DROP TABLE transactions;
ALTER TABLE transactions_new RENAME TO transactions;
CREATE INDEX transactions_month ON transactions (deleted, taipei_month, occurred_at, id);
