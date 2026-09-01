ALTER TABLE task
    ADD COLUMN focus_session_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN focus_minutes INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN last_focused_at TIMESTAMPTZ;

ALTER TABLE task
    ADD CONSTRAINT task_focus_session_count_non_negative CHECK (focus_session_count >= 0),
    ADD CONSTRAINT task_focus_minutes_non_negative CHECK (focus_minutes >= 0);

COMMENT ON COLUMN task.focus_session_count IS '任务已完成的专注会话次数';
COMMENT ON COLUMN task.focus_minutes IS '任务累计记录的专注分钟数';
COMMENT ON COLUMN task.last_focused_at IS '任务最近一次完成专注会话的时间';
