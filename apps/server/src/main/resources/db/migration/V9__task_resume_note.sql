ALTER TABLE task
    ADD COLUMN resume_note VARCHAR(1000),
    ADD COLUMN resume_note_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN task.resume_note IS '用户留下的下次继续位置；空字符串表示明确清除';
COMMENT ON COLUMN task.resume_note_updated_at IS '继续记录最近修改时间；保留清除时间以兼容旧客户端同步';
