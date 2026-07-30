ALTER TABLE task
    ADD COLUMN task_kind VARCHAR(24) NOT NULL DEFAULT 'ACTION',
    ADD COLUMN parent_task_id VARCHAR(64);

ALTER TABLE task
    ADD CONSTRAINT task_kind_valid
        CHECK (task_kind IN ('ACTION', 'WORK_PACKAGE')),
    ADD CONSTRAINT fk_task_parent
        FOREIGN KEY (parent_task_id) REFERENCES task(id);

CREATE INDEX idx_task_project_parent
    ON task(user_id, project_id, parent_task_id)
    WHERE deleted_at IS NULL;

COMMENT ON COLUMN task.task_kind IS
    '项目结构节点类型：ACTION 为可执行任务，WORK_PACKAGE 为仅用于拆解范围的工作包';
COMMENT ON COLUMN task.parent_task_id IS
    '项目结构中的上级工作包任务 ID；为空表示项目根级';
