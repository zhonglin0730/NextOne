CREATE TABLE work_package (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES app_user(id),
    project_id VARCHAR(64) NOT NULL REFERENCES project(id),
    parent_id VARCHAR(64),
    title VARCHAR(500) NOT NULL,
    note TEXT,
    sort_key VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ,
    revision BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT work_package_title_not_blank CHECK (length(trim(title)) > 0),
    CONSTRAINT work_package_revision_positive CHECK (revision > 0),
    CONSTRAINT fk_work_package_parent FOREIGN KEY (parent_id) REFERENCES work_package(id)
);

INSERT INTO work_package (
    id, user_id, project_id, parent_id, title, note, sort_key,
    created_at, updated_at, deleted_at, revision
)
SELECT
    id, user_id, project_id, parent_task_id, title, note, sort_key,
    created_at, updated_at, deleted_at, revision
FROM task
WHERE task_kind = 'WORK_PACKAGE' AND project_id IS NOT NULL;

ALTER TABLE task ADD COLUMN work_package_id VARCHAR(64);

UPDATE task
SET work_package_id = parent_task_id
WHERE task_kind = 'ACTION' AND parent_task_id IS NOT NULL;

ALTER TABLE project DROP CONSTRAINT fk_project_focus_task;
ALTER TABLE project DROP COLUMN focus_task_id;

ALTER TABLE task DROP CONSTRAINT fk_task_parent;
DROP INDEX idx_task_project_parent;

DELETE FROM daily_plan_item
WHERE task_id IN (SELECT id FROM task WHERE task_kind = 'WORK_PACKAGE');
DELETE FROM review_item
WHERE entity_type = 'TASK'
  AND entity_id IN (SELECT id FROM task WHERE task_kind = 'WORK_PACKAGE');
DELETE FROM task_event
WHERE task_id IN (SELECT id FROM task WHERE task_kind = 'WORK_PACKAGE');
DELETE FROM task WHERE task_kind = 'WORK_PACKAGE';

ALTER TABLE task DROP CONSTRAINT task_kind_valid;
ALTER TABLE task DROP COLUMN parent_task_id;
ALTER TABLE task DROP COLUMN task_kind;
ALTER TABLE task
    ADD CONSTRAINT fk_task_work_package
        FOREIGN KEY (work_package_id) REFERENCES work_package(id);

CREATE INDEX idx_work_package_project_parent
    ON work_package(user_id, project_id, parent_id)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_task_work_package
    ON task(user_id, work_package_id)
    WHERE deleted_at IS NULL;

COMMENT ON TABLE work_package IS '项目工作包表，仅用于结构拆解，不参与任务状态流和今日计划';
COMMENT ON COLUMN work_package.id IS '工作包唯一标识';
COMMENT ON COLUMN work_package.user_id IS '所属用户标识';
COMMENT ON COLUMN work_package.project_id IS '所属项目标识';
COMMENT ON COLUMN work_package.parent_id IS '上级工作包标识；为空表示项目根级工作包';
COMMENT ON COLUMN work_package.title IS '工作包名称';
COMMENT ON COLUMN work_package.note IS '工作包范围、结果或约束说明';
COMMENT ON COLUMN work_package.sort_key IS '同级工作包的稳定排序键';
COMMENT ON COLUMN work_package.created_at IS '创建时间';
COMMENT ON COLUMN work_package.updated_at IS '最后更新时间';
COMMENT ON COLUMN work_package.deleted_at IS '软删除时间';
COMMENT ON COLUMN work_package.revision IS '乐观锁版本号';
COMMENT ON COLUMN task.work_package_id IS '所属工作包标识；为空表示项目根级行动';
