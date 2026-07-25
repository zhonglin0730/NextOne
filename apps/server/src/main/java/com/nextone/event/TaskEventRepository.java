package com.nextone.event;

import com.nextone.common.ApiException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Repository
public class TaskEventRepository {

    private final JdbcTemplate jdbcTemplate;
    private final JsonMapper objectMapper;

    public TaskEventRepository(JdbcTemplate jdbcTemplate, JsonMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public void append(
            String userId,
            String taskId,
            String type,
            Map<String, ?> metadata,
            OffsetDateTime occurredAt
    ) {
        try {
            jdbcTemplate.update("""
                    INSERT INTO task_event (
                        id, user_id, task_id, event_type, payload_json, occurred_at
                    ) VALUES (?, ?, ?, ?, CAST(? AS jsonb), ?)
                    """,
                    UUID.randomUUID().toString(),
                    userId,
                    taskId,
                    type,
                    objectMapper.writeValueAsString(metadata),
                    occurredAt
            );
        } catch (JacksonException exception) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "EVENT_SERIALIZATION_FAILED");
        }
    }

    public List<TaskEventView> list(String userId, int limit) {
        return jdbcTemplate.query("""
                SELECT id, task_id, event_type, payload_json::text, occurred_at
                FROM task_event
                WHERE user_id = ?
                ORDER BY occurred_at DESC, id DESC
                LIMIT ?
                """,
                (resultSet, rowNumber) -> new TaskEventView(
                        resultSet.getString("id"),
                        resultSet.getString("task_id"),
                        resultSet.getString("event_type"),
                        readJson(resultSet.getString("payload_json")),
                        resultSet.getObject("occurred_at", OffsetDateTime.class)
                ),
                userId,
                limit
        );
    }

    private JsonNode readJson(String value) {
        try {
            return objectMapper.readTree(value);
        } catch (JacksonException exception) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "EVENT_DESERIALIZATION_FAILED");
        }
    }
}
