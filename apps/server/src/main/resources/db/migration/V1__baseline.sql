CREATE TABLE app_schema_marker (
    id SMALLINT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT app_schema_marker_singleton CHECK (id = 1)
);

INSERT INTO app_schema_marker (id) VALUES (1);
