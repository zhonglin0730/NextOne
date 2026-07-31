package com.nextone.project;

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
public class ProjectRepository {

    private final JdbcTemplate jdbcTemplate;

    public ProjectRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void insert(ProjectView project) {
        jdbcTemplate.update("""
                INSERT INTO project (
                    id, user_id, name, note, status,
                    sort_key, created_at, updated_at, revision
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                project.id(),
                project.userId(),
                project.name(),
                project.note(),
                project.status().name(),
                project.sortKey(),
                project.createdAt(),
                project.updatedAt(),
                project.revision()
        );
    }

    public List<ProjectView> list(String userId) {
        return jdbcTemplate.query("""
                SELECT id, user_id, name, note, status,
                       sort_key, created_at, updated_at, revision
                FROM project
                WHERE user_id = ? AND deleted_at IS NULL
                ORDER BY sort_key, id
                """, this::map, userId);
    }

    public Optional<ProjectView> findById(String userId, String projectId) {
        return jdbcTemplate.query("""
                SELECT id, user_id, name, note, status,
                       sort_key, created_at, updated_at, revision
                FROM project
                WHERE user_id = ? AND id = ? AND deleted_at IS NULL
                """, this::map, userId, projectId).stream().findFirst();
    }

    public void update(ProjectView project) {
        int updated = jdbcTemplate.update("""
                UPDATE project SET
                    name = ?,
                    note = ?,
                    status = ?,
                    updated_at = ?,
                    revision = ?
                WHERE user_id = ? AND id = ? AND revision = ? AND deleted_at IS NULL
                """,
                project.name(),
                project.note(),
                project.status().name(),
                project.updatedAt(),
                project.revision(),
                project.userId(),
                project.id(),
                project.revision() - 1
        );
        if (updated != 1) {
            throw new ApiException(HttpStatus.CONFLICT, "REVISION_CONFLICT");
        }
    }

    private ProjectView map(ResultSet resultSet, int rowNumber) throws SQLException {
        return new ProjectView(
                resultSet.getString("id"),
                resultSet.getString("user_id"),
                resultSet.getString("name"),
                resultSet.getString("note"),
                ProjectStatus.valueOf(resultSet.getString("status")),
                resultSet.getString("sort_key"),
                resultSet.getObject("created_at", OffsetDateTime.class),
                resultSet.getObject("updated_at", OffsetDateTime.class),
                resultSet.getLong("revision")
        );
    }
}
