package com.nextone.workpackage;

import com.nextone.common.ApiException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class WorkPackageRepository {

    private static final String COLUMNS = """
            id, user_id, project_id, parent_id, title, note, sort_key,
            created_at, updated_at, deleted_at, revision
            """;

    private final JdbcTemplate jdbcTemplate;

    public WorkPackageRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<WorkPackageView> list(String userId) {
        return jdbcTemplate.query("""
                SELECT %s FROM work_package
                WHERE user_id = ? AND deleted_at IS NULL
                ORDER BY sort_key, id
                """.formatted(COLUMNS), this::map, userId);
    }

    public List<WorkPackageView> listByProject(String userId, String projectId) {
        return jdbcTemplate.query("""
                SELECT %s FROM work_package
                WHERE user_id = ? AND project_id = ? AND deleted_at IS NULL
                ORDER BY sort_key, id
                """.formatted(COLUMNS), this::map, userId, projectId);
    }

    public Optional<WorkPackageView> findById(String userId, String id) {
        return jdbcTemplate.query("""
                SELECT %s FROM work_package
                WHERE user_id = ? AND id = ? AND deleted_at IS NULL
                """.formatted(COLUMNS), this::map, userId, id).stream().findFirst();
    }

    public void insert(WorkPackageView value) {
        jdbcTemplate.update("""
                INSERT INTO work_package (
                    id, user_id, project_id, parent_id, title, note, sort_key,
                    created_at, updated_at, deleted_at, revision
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                value.id(), value.userId(), value.projectId(), value.parentId(),
                value.title(), value.note(), value.sortKey(), value.createdAt(),
                value.updatedAt(), value.deletedAt(), value.revision());
    }

    public void update(WorkPackageView value) {
        int updated = jdbcTemplate.update("""
                UPDATE work_package SET
                    project_id = ?, parent_id = ?, title = ?, note = ?, sort_key = ?,
                    updated_at = ?, deleted_at = ?, revision = ?
                WHERE user_id = ? AND id = ? AND revision = ?
                """,
                value.projectId(), value.parentId(), value.title(), value.note(), value.sortKey(),
                value.updatedAt(), value.deletedAt(), value.revision(),
                value.userId(), value.id(), value.revision() - 1);
        if (updated != 1) {
            throw new ApiException(HttpStatus.CONFLICT, "REVISION_CONFLICT");
        }
    }

    private WorkPackageView map(ResultSet resultSet, int rowNumber) throws SQLException {
        return new WorkPackageView(
                resultSet.getString("id"),
                resultSet.getString("user_id"),
                resultSet.getString("project_id"),
                resultSet.getString("parent_id"),
                resultSet.getString("title"),
                resultSet.getString("note"),
                resultSet.getString("sort_key"),
                resultSet.getObject("created_at", java.time.OffsetDateTime.class),
                resultSet.getObject("updated_at", java.time.OffsetDateTime.class),
                resultSet.getObject("deleted_at", java.time.OffsetDateTime.class),
                resultSet.getLong("revision")
        );
    }
}
