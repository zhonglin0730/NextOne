package com.nextone.review;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ReviewSessionRepository {

    private final JdbcTemplate jdbcTemplate;

    public ReviewSessionRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void insert(ReviewSessionView session) {
        jdbcTemplate.update("""
                INSERT INTO review_session (
                    id, user_id, review_type, period_start, period_end, status,
                    started_at, completed_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                session.id(),
                session.userId(),
                session.reviewType(),
                date(session.periodStart()),
                date(session.periodEnd()),
                session.status(),
                session.startedAt(),
                session.completedAt(),
                session.createdAt()
        );
    }

    public Optional<ReviewSessionView> find(String userId, String sessionId) {
        return jdbcTemplate.query("""
                SELECT id, user_id, review_type, period_start, period_end, status,
                       started_at, completed_at, created_at
                FROM review_session
                WHERE user_id = ? AND id = ?
                """, this::map, userId, sessionId).stream().findFirst();
    }

    public List<ReviewSessionView> list(String userId) {
        return jdbcTemplate.query("""
                SELECT id, user_id, review_type, period_start, period_end, status,
                       started_at, completed_at, created_at
                FROM review_session
                WHERE user_id = ?
                ORDER BY started_at DESC, id DESC
                """, this::map, userId);
    }

    public void complete(String userId, String sessionId, OffsetDateTime completedAt) {
        jdbcTemplate.update("""
                UPDATE review_session
                SET status = 'COMPLETED', completed_at = ?
                WHERE user_id = ? AND id = ? AND status = 'OPEN'
                """, completedAt, userId, sessionId);
    }

    private ReviewSessionView map(ResultSet resultSet, int rowNumber) throws SQLException {
        return new ReviewSessionView(
                resultSet.getString("id"),
                resultSet.getString("user_id"),
                resultSet.getString("review_type"),
                resultSet.getObject("period_start", LocalDate.class),
                resultSet.getObject("period_end", LocalDate.class),
                resultSet.getString("status"),
                resultSet.getObject("started_at", OffsetDateTime.class),
                resultSet.getObject("completed_at", OffsetDateTime.class),
                resultSet.getObject("created_at", OffsetDateTime.class)
        );
    }

    private Date date(LocalDate value) {
        return value == null ? null : Date.valueOf(value);
    }
}
