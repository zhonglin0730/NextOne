CREATE TABLE app_user (
    id VARCHAR(64) PRIMARY KEY,
    display_name VARCHAR(120) NOT NULL,
    locale VARCHAR(16) NOT NULL,
    time_zone VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    revision BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT app_user_revision_positive CHECK (revision > 0)
);

CREATE TABLE project (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES app_user(id),
    area_id VARCHAR(64),
    name VARCHAR(240) NOT NULL,
    note TEXT,
    status VARCHAR(24) NOT NULL,
    focus_task_id VARCHAR(64),
    sort_key VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ,
    revision BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT project_name_not_blank CHECK (length(trim(name)) > 0),
    CONSTRAINT project_status_valid CHECK (status IN ('ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELED')),
    CONSTRAINT project_revision_positive CHECK (revision > 0)
);

CREATE INDEX idx_project_user_status ON project(user_id, status) WHERE deleted_at IS NULL;

CREATE TABLE task (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES app_user(id),
    area_id VARCHAR(64),
    project_id VARCHAR(64) REFERENCES project(id),
    title VARCHAR(500) NOT NULL,
    note TEXT,
    status VARCHAR(24) NOT NULL,
    visibility VARCHAR(24) NOT NULL,
    deadline_at TIMESTAMPTZ,
    review_at TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ,
    waiting_for VARCHAR(500),
    waiting_since TIMESTAMPTZ,
    estimate_minutes INTEGER,
    energy_level VARCHAR(16),
    sort_key VARCHAR(128) NOT NULL,
    completed_at TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ,
    revision BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT task_title_not_blank CHECK (length(trim(title)) > 0),
    CONSTRAINT task_status_valid CHECK (
        status IN ('INBOX', 'READY', 'DOING', 'WAITING', 'COMPLETED', 'CANCELED')
    ),
    CONSTRAINT task_visibility_valid CHECK (visibility IN ('ACTIVE', 'SNOOZED', 'SOMEDAY')),
    CONSTRAINT task_energy_valid CHECK (
        energy_level IS NULL OR energy_level IN ('LOW', 'MEDIUM', 'HIGH')
    ),
    CONSTRAINT task_estimate_positive CHECK (estimate_minutes IS NULL OR estimate_minutes > 0),
    CONSTRAINT task_revision_positive CHECK (revision > 0)
);

ALTER TABLE project
    ADD CONSTRAINT fk_project_focus_task FOREIGN KEY (focus_task_id) REFERENCES task(id);

CREATE INDEX idx_task_user_status ON task(user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_task_user_project ON task(user_id, project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_task_user_review ON task(user_id, review_at) WHERE deleted_at IS NULL;

CREATE TABLE daily_plan (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES app_user(id),
    plan_date DATE NOT NULL,
    time_zone VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    revision BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT uq_daily_plan_user_date UNIQUE (user_id, plan_date),
    CONSTRAINT daily_plan_revision_positive CHECK (revision > 0)
);

CREATE TABLE daily_plan_item (
    id VARCHAR(64) PRIMARY KEY,
    daily_plan_id VARCHAR(64) NOT NULL REFERENCES daily_plan(id) ON DELETE CASCADE,
    task_id VARCHAR(64) NOT NULL REFERENCES task(id),
    section VARCHAR(16) NOT NULL,
    sort_key VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_daily_plan_item_task UNIQUE (daily_plan_id, task_id),
    CONSTRAINT daily_plan_item_section_valid CHECK (section IN ('FOCUS', 'LATER'))
);

CREATE INDEX idx_daily_plan_item_plan_section
    ON daily_plan_item(daily_plan_id, section, sort_key);

CREATE TABLE task_event (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES app_user(id),
    task_id VARCHAR(64) NOT NULL REFERENCES task(id),
    event_type VARCHAR(48) NOT NULL,
    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_task_event_user_time ON task_event(user_id, occurred_at DESC);
CREATE INDEX idx_task_event_task_time ON task_event(task_id, occurred_at DESC);

CREATE TABLE review_session (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES app_user(id),
    review_type VARCHAR(24) NOT NULL,
    period_start DATE,
    period_end DATE,
    status VARCHAR(24) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT review_session_type_valid CHECK (review_type IN ('DAILY', 'WEEKLY')),
    CONSTRAINT review_session_status_valid CHECK (status IN ('OPEN', 'COMPLETED'))
);

CREATE TABLE review_item (
    id VARCHAR(64) PRIMARY KEY,
    review_session_id VARCHAR(64) NOT NULL REFERENCES review_session(id) ON DELETE CASCADE,
    entity_type VARCHAR(24) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    reason VARCHAR(48) NOT NULL,
    decision VARCHAR(48),
    decision_payload JSONB,
    decided_at TIMESTAMPTZ,
    CONSTRAINT review_item_entity_type_valid CHECK (entity_type IN ('TASK', 'PROJECT'))
);

CREATE INDEX idx_review_session_user_time ON review_session(user_id, started_at DESC);
