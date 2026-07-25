package com.nextone.sync;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Repository
public class SyncRepository {

    private final JdbcTemplate jdbcTemplate;
    private final JsonMapper jsonMapper;

    public SyncRepository(JdbcTemplate jdbcTemplate, JsonMapper jsonMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.jsonMapper = jsonMapper;
    }

    public Optional<SyncDtos.MutationResult> findResult(
            String userId,
            String clientMutationId
    ) {
        return jdbcTemplate.query("""
                SELECT result_status, result_revision, server_sequence,
                       error_code, result_payload::text
                FROM sync_mutation
                WHERE user_id = ? AND client_mutation_id = ?
                """,
                (resultSet, rowNumber) -> new SyncDtos.MutationResult(
                        clientMutationId,
                        "APPLIED".equals(resultSet.getString("result_status"))
                                ? "ALREADY_APPLIED"
                                : resultSet.getString("result_status"),
                        resultSet.getObject("result_revision", Long.class),
                        resultSet.getObject("server_sequence", Long.class),
                        resultSet.getString("error_code"),
                        readJson(resultSet.getString("result_payload"))
                ),
                userId,
                clientMutationId
        ).stream().findFirst();
    }

    public void saveResult(
            String userId,
            String deviceId,
            SyncDtos.MutationRequest mutation,
            SyncDtos.MutationResult result
    ) {
        jdbcTemplate.update("""
                INSERT INTO sync_mutation (
                    user_id, client_mutation_id, device_id, entity_type, entity_id,
                    operation, base_revision, payload_json, occurred_at,
                    result_status, result_revision, server_sequence, error_code,
                    result_payload
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?,
                    ?, ?, ?, ?, CAST(? AS jsonb)
                )
                """,
                userId,
                mutation.clientMutationId(),
                deviceId,
                mutation.entityType(),
                mutation.entityId(),
                mutation.operation(),
                mutation.baseRevision(),
                writeJson(mutation.payload()),
                mutation.occurredAt(),
                result.status(),
                result.revision(),
                result.serverSequence(),
                result.errorCode(),
                writeJson(result.serverPayload())
        );
    }

    public long appendChange(
            String userId,
            String entityType,
            String entityId,
            String operation,
            long revision,
            JsonNode payload,
            OffsetDateTime createdAt
    ) {
        Long sequence = jdbcTemplate.queryForObject("""
                INSERT INTO change_log (
                    user_id, entity_type, entity_id, operation,
                    revision, payload_json, created_at
                ) VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb), ?)
                RETURNING server_sequence
                """,
                Long.class,
                userId,
                entityType,
                entityId,
                operation,
                revision,
                writeJson(payload),
                createdAt
        );
        if (sequence == null) {
            throw new IllegalStateException("Change log did not return a sequence");
        }
        return sequence;
    }

    public List<SyncDtos.Change> listChanges(String userId, long cursor, int limit) {
        return jdbcTemplate.query("""
                SELECT server_sequence, entity_type, entity_id, operation,
                       revision, payload_json::text, created_at
                FROM change_log
                WHERE user_id = ? AND server_sequence > ?
                ORDER BY server_sequence
                LIMIT ?
                """,
                (resultSet, rowNumber) -> new SyncDtos.Change(
                        resultSet.getLong("server_sequence"),
                        resultSet.getString("entity_type"),
                        resultSet.getString("entity_id"),
                        resultSet.getString("operation"),
                        resultSet.getLong("revision"),
                        readJson(resultSet.getString("payload_json")),
                        resultSet.getObject("created_at", OffsetDateTime.class)
                ),
                userId,
                cursor,
                limit
        );
    }

    public boolean hasChangesAfter(String userId, long cursor) {
        Boolean exists = jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM change_log
                    WHERE user_id = ? AND server_sequence > ?
                )
                """, Boolean.class, userId, cursor);
        return Boolean.TRUE.equals(exists);
    }

    private String writeJson(JsonNode value) {
        if (value == null || value.isNull()) {
            return null;
        }
        try {
            return jsonMapper.writeValueAsString(value);
        } catch (JacksonException exception) {
            throw new IllegalStateException("Unable to serialize sync payload", exception);
        }
    }

    private JsonNode readJson(String value) {
        if (value == null) {
            return null;
        }
        try {
            return jsonMapper.readTree(value);
        } catch (JacksonException exception) {
            throw new IllegalStateException("Unable to deserialize sync payload", exception);
        }
    }
}
