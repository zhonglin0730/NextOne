CREATE TABLE account_deletion_request (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES app_user(id),
    status VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT account_deletion_request_status_valid CHECK (
        status IN ('AWAITING_FINAL_CONFIRMATION', 'CANCELED', 'EXPIRED')
    )
);

CREATE INDEX idx_account_deletion_request_user_created
    ON account_deletion_request(user_id, created_at DESC);
