CREATE TABLE sync_mutation (
    user_id VARCHAR(64) NOT NULL REFERENCES app_user(id),
    client_mutation_id VARCHAR(64) NOT NULL,
    device_id VARCHAR(128) NOT NULL,
    entity_type VARCHAR(32) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    operation VARCHAR(16) NOT NULL,
    base_revision BIGINT NOT NULL,
    payload_json JSONB,
    occurred_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    result_status VARCHAR(24) NOT NULL,
    result_revision BIGINT,
    server_sequence BIGINT,
    error_code VARCHAR(64),
    result_payload JSONB,
    PRIMARY KEY (user_id, client_mutation_id),
    CONSTRAINT sync_mutation_operation_valid CHECK (operation IN ('UPSERT', 'DELETE')),
    CONSTRAINT sync_mutation_result_valid CHECK (
        result_status IN ('APPLIED', 'ALREADY_APPLIED', 'REJECTED', 'CONFLICT')
    ),
    CONSTRAINT sync_mutation_base_revision_nonnegative CHECK (base_revision >= 0)
);

CREATE INDEX idx_sync_mutation_user_received
    ON sync_mutation(user_id, received_at DESC);

CREATE TABLE change_log (
    server_sequence BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES app_user(id),
    entity_type VARCHAR(32) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    operation VARCHAR(16) NOT NULL,
    revision BIGINT NOT NULL,
    payload_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT change_log_operation_valid CHECK (operation IN ('UPSERT', 'DELETE')),
    CONSTRAINT change_log_revision_nonnegative CHECK (revision >= 0)
);

CREATE INDEX idx_change_log_user_sequence
    ON change_log(user_id, server_sequence);
