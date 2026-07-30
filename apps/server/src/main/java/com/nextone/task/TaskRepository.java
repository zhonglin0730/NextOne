package com.nextone.task;

import com.nextone.common.ApiException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class TaskRepository {

    private static final String COLUMNS = """
            id, user_id, project_id, parent_task_id, task_kind, title, note, status, visibility,
            deadline_at, review_at, reviewed_at, waiting_for, waiting_since,
            estimate_minutes, energy_level, sort_key, completed_at, canceled_at,
            created_at, updated_at, revision
            """;

    private final JdbcTemplate jdbcTemplate;

    public TaskRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void insert(TaskView task) {
        jdbcTemplate.update("""
                INSERT INTO task (
                    id, user_id, project_id, parent_task_id, task_kind, title, note, status, visibility,
                    deadline_at, review_at, reviewed_at, waiting_for, waiting_since,
                    estimate_minutes, energy_level, sort_key, completed_at, canceled_at,
                    created_at, updated_at, revision
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                task.id(),
                task.userId(),
                task.projectId(),
                task.parentTaskId(),
                task.kind().name(),
                task.title(),
                task.note(),
                task.status().name(),
                task.visibility().name(),
                task.deadlineAt(),
                task.reviewAt(),
                task.reviewedAt(),
                task.waitingFor(),
                task.waitingSince(),
                task.estimateMinutes(),
                task.energyLevel() == null ? null : task.energyLevel().name(),
                task.sortKey(),
                task.completedAt(),
                task.canceledAt(),
                task.createdAt(),
                task.updatedAt(),
                task.revision()
        );
    }

    public Optional<TaskView> findById(String userId, String id) {
        return jdbcTemplate.query("""
                SELECT %s
                FROM task
                WHERE user_id = ? AND id = ? AND deleted_at IS NULL
                """.formatted(COLUMNS), this::map, userId, id).stream().findFirst();
    }

    public List<TaskView> list(String userId, boolean includeCanceled) {
        String canceledFilter = includeCanceled ? "" : "AND status <> 'CANCELED'";
        return jdbcTemplate.query("""
                SELECT %s
                FROM task
                WHERE user_id = ? AND deleted_at IS NULL
                %s
                ORDER BY sort_key, id
                """.formatted(COLUMNS, canceledFilter), this::map, userId);
    }

    public List<TaskView> listByProject(String userId, String projectId) {
        return jdbcTemplate.query("""
                SELECT %s
                FROM task
                WHERE user_id = ? AND project_id = ? AND deleted_at IS NULL
                ORDER BY sort_key, id
                """.formatted(COLUMNS), this::map, userId, projectId);
    }

    public long countDoing(String userId) {
        Long count = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM task
                WHERE user_id = ? AND task_kind = 'ACTION'
                  AND status = 'DOING' AND deleted_at IS NULL
                """, Long.class, userId);
        return count == null ? 0 : count;
    }

    public void lockWipDecision(String userId) {
        jdbcTemplate.queryForObject(
                "SELECT pg_advisory_xact_lock(hashtext(?)) IS NULL",
                Boolean.class,
                "task-wip:" + userId
        );
    }

    public boolean projectExists(String userId, String projectId) {
        Integer count = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM project
                WHERE user_id = ? AND id = ? AND deleted_at IS NULL
                """, Integer.class, userId, projectId);
        return count != null && count > 0;
    }

    public boolean clearProjectFocusForTask(String userId, String taskId, OffsetDateTime now) {
        return jdbcTemplate.update("""
                UPDATE project
                SET focus_task_id = NULL, updated_at = ?, revision = revision + 1
                WHERE user_id = ? AND focus_task_id = ? AND deleted_at IS NULL
                """, now, userId, taskId) > 0;
    }

    public void update(TaskView task) {
        int updated = jdbcTemplate.update("""
                UPDATE task SET
                    project_id = ?,
                    parent_task_id = ?,
                    task_kind = ?,
                    title = ?,
                    note = ?,
                    status = ?,
                    visibility = ?,
                    deadline_at = ?,
                    review_at = ?,
                    reviewed_at = ?,
                    waiting_for = ?,
                    waiting_since = ?,
                    estimate_minutes = ?,
                    energy_level = ?,
                    sort_key = ?,
                    completed_at = ?,
                    canceled_at = ?,
                    updated_at = ?,
                    revision = ?
                WHERE user_id = ? AND id = ? AND revision = ? AND deleted_at IS NULL
                """,
                task.projectId(),
                task.parentTaskId(),
                task.kind().name(),
                task.title(),
                task.note(),
                task.status().name(),
                task.visibility().name(),
                task.deadlineAt(),
                task.reviewAt(),
                task.reviewedAt(),
                task.waitingFor(),
                task.waitingSince(),
                task.estimateMinutes(),
                task.energyLevel() == null ? null : task.energyLevel().name(),
                task.sortKey(),
                task.completedAt(),
                task.canceledAt(),
                task.updatedAt(),
                task.revision(),
                task.userId(),
                task.id(),
                task.revision() - 1
        );
        if (updated != 1) {
            throw new ApiException(HttpStatus.CONFLICT, "REVISION_CONFLICT");
        }
    }

    private TaskView map(ResultSet resultSet, int rowNumber) throws SQLException {
        return new TaskView(
                resultSet.getString("id"),
                resultSet.getString("user_id"),
                resultSet.getString("project_id"),
                resultSet.getString("parent_task_id"),
                TaskKind.valueOf(resultSet.getString("task_kind")),
                resultSet.getString("title"),
                resultSet.getString("note"),
                TaskStatus.valueOf(resultSet.getString("status")),
                TaskVisibility.valueOf(resultSet.getString("visibility")),
                resultSet.getObject("deadline_at", OffsetDateTime.class),
                resultSet.getObject("review_at", OffsetDateTime.class),
                resultSet.getObject("reviewed_at", OffsetDateTime.class),
                resultSet.getString("waiting_for"),
                resultSet.getObject("waiting_since", OffsetDateTime.class),
                resultSet.getObject("estimate_minutes", Integer.class),
                resultSet.getString("energy_level") == null
                        ? null
                        : EnergyLevel.valueOf(resultSet.getString("energy_level")),
                resultSet.getString("sort_key"),
                resultSet.getObject("completed_at", OffsetDateTime.class),
                resultSet.getObject("canceled_at", OffsetDateTime.class),
                resultSet.getObject("created_at", OffsetDateTime.class),
                resultSet.getObject("updated_at", OffsetDateTime.class),
                resultSet.getLong("revision")
        );
    }
}
