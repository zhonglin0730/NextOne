package com.nextone.dailyplan;

import com.nextone.task.TaskRepository;
import com.nextone.task.TaskView;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class DailyPlanRepository {

    private final JdbcTemplate jdbcTemplate;
    private final TaskRepository tasks;

    public DailyPlanRepository(JdbcTemplate jdbcTemplate, TaskRepository tasks) {
        this.jdbcTemplate = jdbcTemplate;
        this.tasks = tasks;
    }

    public Optional<DailyPlanRecord> find(String userId, LocalDate date) {
        return jdbcTemplate.query("""
                SELECT id, user_id, plan_date, time_zone, created_at, updated_at, revision
                FROM daily_plan
                WHERE user_id = ? AND plan_date = ?
                """, this::mapPlan, userId, Date.valueOf(date)).stream().findFirst();
    }

    public void lockFocusDecision(String userId, LocalDate date) {
        jdbcTemplate.queryForObject(
                "SELECT pg_advisory_xact_lock(hashtext(?)) IS NULL",
                Boolean.class,
                "daily-focus:" + userId + ":" + date
        );
    }

    public List<DailyPlanView> listAll(String userId) {
        return jdbcTemplate.query("""
                SELECT id, user_id, plan_date, time_zone, created_at, updated_at, revision
                FROM daily_plan
                WHERE user_id = ?
                ORDER BY plan_date, id
                """, this::mapPlan, userId).stream().map(this::toView).toList();
    }

    public void insert(DailyPlanRecord plan) {
        jdbcTemplate.update("""
                INSERT INTO daily_plan (
                    id, user_id, plan_date, time_zone, created_at, updated_at, revision
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                plan.id(),
                plan.userId(),
                Date.valueOf(plan.localDate()),
                plan.timeZone(),
                plan.createdAt(),
                plan.updatedAt(),
                plan.revision()
        );
    }

    public Optional<DailyPlanItemRecord> findItem(String planId, String taskId) {
        return jdbcTemplate.query("""
                SELECT id, daily_plan_id, task_id, section, sort_key, created_at
                FROM daily_plan_item
                WHERE daily_plan_id = ? AND task_id = ?
                """, this::mapItem, planId, taskId).stream().findFirst();
    }

    public long countSection(String planId, DailyPlanSection section) {
        Long count = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM daily_plan_item
                WHERE daily_plan_id = ? AND section = ?
                """, Long.class, planId, section.name());
        return count == null ? 0 : count;
    }

    public void upsertItem(DailyPlanItemRecord item) {
        jdbcTemplate.update("""
                INSERT INTO daily_plan_item (
                    id, daily_plan_id, task_id, section, sort_key, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (daily_plan_id, task_id) DO UPDATE SET
                    section = EXCLUDED.section,
                    sort_key = EXCLUDED.sort_key
                """,
                item.id(),
                item.planId(),
                item.taskId(),
                item.section().name(),
                item.sortKey(),
                item.createdAt()
        );
    }

    public boolean removeItem(String userId, String planId, String taskId) {
        return jdbcTemplate.update("""
                DELETE FROM daily_plan_item item
                USING daily_plan plan
                WHERE item.daily_plan_id = plan.id
                  AND plan.user_id = ?
                  AND plan.id = ?
                  AND item.task_id = ?
                """, userId, planId, taskId) == 1;
    }

    public void touch(String userId, String planId, OffsetDateTime now) {
        jdbcTemplate.update("""
                UPDATE daily_plan
                SET updated_at = ?, revision = revision + 1
                WHERE user_id = ? AND id = ?
                """, now, userId, planId);
    }

    public DailyPlanView toView(DailyPlanRecord plan) {
        List<DailyPlanView.DailyPlanTask> focus = new ArrayList<>();
        List<DailyPlanView.DailyPlanTask> later = new ArrayList<>();
        for (DailyPlanItemRecord item : listItems(plan.id())) {
            TaskView task = tasks.findById(plan.userId(), item.taskId()).orElse(null);
            if (task == null) {
                continue;
            }
            var view = new DailyPlanView.DailyPlanTask(
                    item.id(),
                    item.section(),
                    item.sortKey(),
                    item.createdAt(),
                    task
            );
            if (item.section() == DailyPlanSection.FOCUS) {
                focus.add(view);
            } else {
                later.add(view);
            }
        }
        return new DailyPlanView(
                plan.id(),
                plan.userId(),
                plan.localDate(),
                plan.timeZone(),
                plan.createdAt(),
                plan.updatedAt(),
                plan.revision(),
                focus,
                later
        );
    }

    private List<DailyPlanItemRecord> listItems(String planId) {
        return jdbcTemplate.query("""
                SELECT id, daily_plan_id, task_id, section, sort_key, created_at
                FROM daily_plan_item
                WHERE daily_plan_id = ?
                ORDER BY section, sort_key, id
                """, this::mapItem, planId);
    }

    private DailyPlanRecord mapPlan(ResultSet resultSet, int rowNumber) throws SQLException {
        return new DailyPlanRecord(
                resultSet.getString("id"),
                resultSet.getString("user_id"),
                resultSet.getObject("plan_date", LocalDate.class),
                resultSet.getString("time_zone"),
                resultSet.getObject("created_at", OffsetDateTime.class),
                resultSet.getObject("updated_at", OffsetDateTime.class),
                resultSet.getLong("revision")
        );
    }

    private DailyPlanItemRecord mapItem(ResultSet resultSet, int rowNumber) throws SQLException {
        return new DailyPlanItemRecord(
                resultSet.getString("id"),
                resultSet.getString("daily_plan_id"),
                resultSet.getString("task_id"),
                DailyPlanSection.valueOf(resultSet.getString("section")),
                resultSet.getString("sort_key"),
                resultSet.getObject("created_at", OffsetDateTime.class)
        );
    }

    public record DailyPlanRecord(
            String id,
            String userId,
            LocalDate localDate,
            String timeZone,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt,
            long revision
    ) {
    }

    public record DailyPlanItemRecord(
            String id,
            String planId,
            String taskId,
            DailyPlanSection section,
            String sortKey,
            OffsetDateTime createdAt
    ) {
    }
}
