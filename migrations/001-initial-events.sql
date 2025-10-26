-- Up
CREATE TABLE Events (
    uuid BLOB PRIMARY KEY,
    created_at INTEGER,
    event_type TEXT NOT NULL
) STRICT;

CREATE INDEX Events_idx_uuid ON Events (uuid);

-- Down
DROP INDEX Events_idx_uuid;
DROP TABLE Events;
