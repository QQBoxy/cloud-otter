CREATE TABLE announcement_revision (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision TEXT NOT NULL,
  ordered_ids TEXT NOT NULL
);

INSERT INTO announcement_revision (id, revision, ordered_ids) VALUES (1, 'initial', '[]');
