package com.nextone.sync;

import com.nextone.common.ApiException;
import com.nextone.event.TaskEventRepository;
import com.nextone.project.ProjectRepository;
import com.nextone.project.ProjectView;
import com.nextone.task.TaskRepository;
import com.nextone.task.TaskStatus;
import com.nextone.task.TaskView;
import com.nextone.workpackage.WorkPackageRepository;
import com.nextone.workpackage.WorkPackageView;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

@Service
public class SyncService {

    private static final int MAX_PUSH_MUTATIONS = 100;

    private final SyncRepository syncRepository;
    private final TaskRepository tasks;
    private final ProjectRepository projects;
    private final WorkPackageRepository workPackages;
    private final TaskEventRepository events;
    private final JdbcTemplate jdbcTemplate;
    private final JsonMapper jsonMapper;
    private final TransactionTemplate transactions;

    public SyncService(
            SyncRepository syncRepository,
            TaskRepository tasks,
            ProjectRepository projects,
            WorkPackageRepository workPackages,
            TaskEventRepository events,
            JdbcTemplate jdbcTemplate,
            JsonMapper jsonMapper,
            TransactionTemplate transactions
    ) {
        this.syncRepository = syncRepository;
        this.tasks = tasks;
        this.projects = projects;
        this.workPackages = workPackages;
        this.events = events;
        this.jdbcTemplate = jdbcTemplate;
        this.jsonMapper = jsonMapper;
        this.transactions = transactions;
    }

    public SyncDtos.PushResponse push(String userId, SyncDtos.PushRequest request) {
        if (request.mutations().size() > MAX_PUSH_MUTATIONS) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "SYNC_PUSH_LIMIT_EXCEEDED", Map.of(
                    "limit", MAX_PUSH_MUTATIONS
            ));
        }
        List<SyncDtos.MutationResult> results = new ArrayList<>();
        for (SyncDtos.MutationRequest mutation : request.mutations()) {
            SyncDtos.MutationResult result;
            try {
                result = transactions.execute(status ->
                        applyOne(userId, request.deviceId(), mutation));
            } catch (RuntimeException exception) {
                result = rejected(mutation, "SYNC_MUTATION_FAILED");
                SyncDtos.MutationResult failed = result;
                transactions.executeWithoutResult(status ->
                        saveIfAbsent(userId, request.deviceId(), mutation, failed));
            }
            results.add(result);
        }
        return new SyncDtos.PushResponse(results);
    }

    public SyncDtos.PullResponse pull(String userId, long cursor, int limit) {
        List<SyncDtos.Change> changes = syncRepository.listChanges(userId, cursor, limit);
        long nextCursor = changes.isEmpty()
                ? cursor
                : changes.get(changes.size() - 1).serverSequence();
        return new SyncDtos.PullResponse(
                nextCursor,
                syncRepository.hasChangesAfter(userId, nextCursor),
                changes
        );
    }

    private SyncDtos.MutationResult applyOne(
            String userId,
            String deviceId,
            SyncDtos.MutationRequest mutation
    ) {
        Optional<SyncDtos.MutationResult> existing = syncRepository.findResult(
                userId,
                mutation.clientMutationId()
        );
        if (existing.isPresent()) {
            return existing.get();
        }

        SyncDtos.MutationResult result = switch (mutation.entityType()) {
            case "TASK" -> applyTask(userId, mutation);
            case "PROJECT" -> applyProject(userId, mutation);
            case "WORK_PACKAGE" -> applyWorkPackage(userId, mutation);
            case "DAILY_PLAN" -> applyDailyPlan(userId, mutation);
            case "DAILY_PLAN_ITEM" -> applyDailyPlanItem(userId, mutation);
            default -> rejected(mutation, "SYNC_ENTITY_TYPE_UNSUPPORTED");
        };
        syncRepository.saveResult(userId, deviceId, mutation, result);
        return result;
    }

    private SyncDtos.MutationResult applyTask(
            String userId,
            SyncDtos.MutationRequest mutation
    ) {
        Optional<TaskView> current = tasks.findById(userId, mutation.entityId());
        if ("DELETE".equals(mutation.operation())) {
            return deleteTask(userId, mutation, current);
        }
        if (!"UPSERT".equals(mutation.operation()) || mutation.payload() == null) {
            return rejected(mutation, "SYNC_OPERATION_INVALID");
        }

        TaskView incoming;
        try {
            incoming = readTask(userId, mutation);
        } catch (RuntimeException exception) {
            return rejected(mutation, "SYNC_PAYLOAD_INVALID");
        }
        if (current.isEmpty()) {
            if (mutation.baseRevision() != 0) {
                return conflict(mutation, null, "REVISION_CONFLICT");
            }
            if (incoming.status() != TaskStatus.INBOX) {
                return rejected(mutation, "TASK_CREATE_STATUS_INVALID");
            }
            if (!projectIsValid(userId, incoming.projectId())
                    || !workPackageIsValid(userId, incoming.projectId(), incoming.workPackageId())) {
                return rejected(mutation, "PROJECT_NOT_FOUND");
            }
            TaskView created = taskWithRevision(incoming, userId, 1, incoming.createdAt());
            tasks.insert(created);
            events.append(userId, created.id(), "CREATED", Map.of(), mutation.occurredAt());
            return appliedChange(
                    userId,
                    mutation,
                    1,
                    jsonMapper.valueToTree(created),
                    mutation.occurredAt()
            );
        }

        TaskView stored = current.get();
        boolean revisionMatches = mutation.baseRevision() == stored.revision();
        boolean completionMerge = !revisionMatches
                && (stored.status() == TaskStatus.COMPLETED
                || incoming.status() == TaskStatus.COMPLETED);
        if (!revisionMatches && !completionMerge) {
            return conflict(
                    mutation,
                    jsonMapper.valueToTree(stored),
                    "REVISION_CONFLICT"
            );
        }

        TaskStatus target = completionMerge ? TaskStatus.COMPLETED : incoming.status();
        if (!completionMerge && !stored.status().canTransitionTo(target)) {
            return rejected(mutation, "TASK_TRANSITION_INVALID");
        }
        if (!projectIsValid(userId, incoming.projectId())
                || !workPackageIsValid(userId, incoming.projectId(), incoming.workPackageId())) {
            return rejected(mutation, "PROJECT_NOT_FOUND");
        }
        if (target == TaskStatus.DOING && stored.status() != TaskStatus.DOING) {
            tasks.lockWipDecision(userId);
            if (tasks.countDoing(userId) >= 3) {
                return rejected(mutation, "WIP_LIMIT_EXCEEDED");
            }
        }

        OffsetDateTime updatedAt = later(stored.updatedAt(), incoming.updatedAt());
        TaskView merged = new TaskView(
                stored.id(),
                userId,
                incoming.projectId(),
                incoming.workPackageId(),
                incoming.title(),
                incoming.note(),
                target,
                incoming.visibility(),
                incoming.deadlineAt(),
                incoming.reviewAt(),
                incoming.reviewedAt(),
                incoming.waitingFor(),
                target == TaskStatus.WAITING
                        ? firstNonNull(incoming.waitingSince(), mutation.occurredAt())
                        : null,
                incoming.estimateMinutes(),
                incoming.energyLevel(),
                incoming.sortKey(),
                target == TaskStatus.COMPLETED
                        ? firstNonNull(
                                stored.completedAt(),
                                firstNonNull(incoming.completedAt(), mutation.occurredAt())
                        )
                        : null,
                target == TaskStatus.CANCELED
                        ? firstNonNull(incoming.canceledAt(), mutation.occurredAt())
                        : null,
                stored.createdAt(),
                updatedAt,
                stored.revision() + 1
        );
        tasks.update(merged);
        events.append(
                userId,
                merged.id(),
                eventType(stored.status(), merged.status()),
                Map.of(
                        "fromStatus", stored.status().name(),
                        "toStatus", merged.status().name(),
                        "syncMerge", completionMerge
                ),
                mutation.occurredAt()
        );
        return appliedChange(
                userId,
                mutation,
                merged.revision(),
                jsonMapper.valueToTree(merged),
                mutation.occurredAt()
        );
    }

    private SyncDtos.MutationResult deleteTask(
            String userId,
            SyncDtos.MutationRequest mutation,
            Optional<TaskView> current
    ) {
        if (current.isEmpty()) {
            return appliedWithoutChange(mutation, mutation.baseRevision());
        }
        TaskView stored = current.get();
        if (mutation.baseRevision() != stored.revision()) {
            return conflict(
                    mutation,
                    jsonMapper.valueToTree(stored),
                    "DELETE_CONFLICT"
            );
        }
        long revision = stored.revision() + 1;
        jdbcTemplate.update("""
                UPDATE task
                SET deleted_at = ?, updated_at = ?, revision = ?
                WHERE user_id = ? AND id = ? AND revision = ?
                """,
                mutation.occurredAt(),
                later(stored.updatedAt(), mutation.occurredAt()),
                revision,
                userId,
                stored.id(),
                stored.revision()
        );
        ObjectNode tombstone = jsonMapper.valueToTree(stored);
        tombstone.put("deletedAt", mutation.occurredAt().toString());
        tombstone.put("revision", revision);
        return appliedChange(
                userId,
                mutation,
                revision,
                tombstone,
                mutation.occurredAt()
        );
    }

    private SyncDtos.MutationResult applyProject(
            String userId,
            SyncDtos.MutationRequest mutation
    ) {
        Optional<ProjectView> current = projects.findById(userId, mutation.entityId());
        if ("DELETE".equals(mutation.operation())) {
            if (current.isEmpty()) {
                return appliedWithoutChange(mutation, mutation.baseRevision());
            }
            ProjectView stored = current.get();
            if (mutation.baseRevision() != stored.revision()) {
                return conflict(
                        mutation,
                        jsonMapper.valueToTree(stored),
                        "DELETE_CONFLICT"
                );
            }
            long revision = stored.revision() + 1;
            jdbcTemplate.update("""
                    UPDATE project
                    SET deleted_at = ?, updated_at = ?, revision = ?
                    WHERE user_id = ? AND id = ? AND revision = ?
                    """,
                    mutation.occurredAt(),
                    later(stored.updatedAt(), mutation.occurredAt()),
                    revision,
                    userId,
                    stored.id(),
                    stored.revision()
            );
            ObjectNode tombstone = jsonMapper.valueToTree(stored);
            tombstone.put("deletedAt", mutation.occurredAt().toString());
            tombstone.put("revision", revision);
            return appliedChange(userId, mutation, revision, tombstone, mutation.occurredAt());
        }
        if (!"UPSERT".equals(mutation.operation()) || mutation.payload() == null) {
            return rejected(mutation, "SYNC_OPERATION_INVALID");
        }

        ProjectView incoming;
        try {
            ObjectNode normalized = (ObjectNode) mutation.payload().deepCopy();
            normalized.put("userId", userId);
            normalized.remove(List.of("areaId", "deletedAt"));
            incoming = jsonMapper.treeToValue(normalized, ProjectView.class);
        } catch (JacksonException | ClassCastException exception) {
            return rejected(mutation, "SYNC_PAYLOAD_INVALID");
        }
        if (!incoming.id().equals(mutation.entityId()) || incoming.name().isBlank()) {
            return rejected(mutation, "SYNC_PAYLOAD_INVALID");
        }
        if (current.isEmpty()) {
            if (mutation.baseRevision() != 0) {
                return conflict(mutation, null, "REVISION_CONFLICT");
            }
            ProjectView created = projectWithRevision(incoming, userId, 1, incoming.createdAt());
            projects.insert(created);
            return appliedChange(
                    userId,
                    mutation,
                    1,
                    jsonMapper.valueToTree(created),
                    mutation.occurredAt()
            );
        }

        ProjectView stored = current.get();
        if (mutation.baseRevision() != stored.revision()) {
            return conflict(
                    mutation,
                    jsonMapper.valueToTree(stored),
                    "REVISION_CONFLICT"
            );
        }
        ProjectView updated = new ProjectView(
                stored.id(),
                userId,
                incoming.name(),
                incoming.note(),
                incoming.status(),
                incoming.sortKey(),
                stored.createdAt(),
                later(stored.updatedAt(), incoming.updatedAt()),
                stored.revision() + 1
        );
        projects.update(updated);
        return appliedChange(
                userId,
                mutation,
                updated.revision(),
                jsonMapper.valueToTree(updated),
                mutation.occurredAt()
        );
    }

    private SyncDtos.MutationResult applyWorkPackage(
            String userId,
            SyncDtos.MutationRequest mutation
    ) {
        Optional<WorkPackageView> current = workPackages.findById(
                userId,
                mutation.entityId()
        );
        if ("DELETE".equals(mutation.operation())) {
            if (current.isEmpty()) {
                return appliedWithoutChange(mutation, mutation.baseRevision());
            }
            WorkPackageView stored = current.get();
            if (mutation.baseRevision() != stored.revision()) {
                return conflict(
                        mutation,
                        jsonMapper.valueToTree(stored),
                        "DELETE_CONFLICT"
                );
            }
            long revision = stored.revision() + 1;
            jdbcTemplate.update("""
                    UPDATE work_package
                    SET deleted_at = ?, updated_at = ?, revision = ?
                    WHERE user_id = ? AND id = ? AND revision = ?
                    """,
                    mutation.occurredAt(),
                    later(stored.updatedAt(), mutation.occurredAt()),
                    revision,
                    userId,
                    stored.id(),
                    stored.revision()
            );
            ObjectNode tombstone = jsonMapper.valueToTree(stored);
            tombstone.put("deletedAt", mutation.occurredAt().toString());
            tombstone.put("revision", revision);
            return appliedChange(
                    userId,
                    mutation,
                    revision,
                    tombstone,
                    mutation.occurredAt()
            );
        }
        if (!"UPSERT".equals(mutation.operation()) || mutation.payload() == null) {
            return rejected(mutation, "SYNC_OPERATION_INVALID");
        }

        WorkPackageView incoming;
        try {
            ObjectNode normalized = (ObjectNode) mutation.payload().deepCopy();
            normalized.put("userId", userId);
            incoming = jsonMapper.treeToValue(normalized, WorkPackageView.class);
        } catch (JacksonException | ClassCastException exception) {
            return rejected(mutation, "SYNC_PAYLOAD_INVALID");
        }
        if (!incoming.id().equals(mutation.entityId())
                || incoming.title().isBlank()
                || !projectIsValid(userId, incoming.projectId())
                || incoming.projectId() == null
                || !workPackageParentIsValid(userId, incoming)) {
            return rejected(mutation, "SYNC_PAYLOAD_INVALID");
        }

        if (current.isEmpty()) {
            if (mutation.baseRevision() != 0) {
                return conflict(mutation, null, "REVISION_CONFLICT");
            }
            WorkPackageView created = workPackageWithRevision(
                    incoming,
                    userId,
                    1,
                    incoming.createdAt()
            );
            workPackages.insert(created);
            return appliedChange(
                    userId,
                    mutation,
                    1,
                    jsonMapper.valueToTree(created),
                    mutation.occurredAt()
            );
        }

        WorkPackageView stored = current.get();
        if (mutation.baseRevision() != stored.revision()) {
            return conflict(
                    mutation,
                    jsonMapper.valueToTree(stored),
                    "REVISION_CONFLICT"
            );
        }
        WorkPackageView updated = new WorkPackageView(
                stored.id(),
                userId,
                incoming.projectId(),
                incoming.parentId(),
                incoming.title(),
                incoming.note(),
                incoming.sortKey(),
                stored.createdAt(),
                later(stored.updatedAt(), incoming.updatedAt()),
                null,
                stored.revision() + 1
        );
        workPackages.update(updated);
        return appliedChange(
                userId,
                mutation,
                updated.revision(),
                jsonMapper.valueToTree(updated),
                mutation.occurredAt()
        );
    }

    private SyncDtos.MutationResult applyDailyPlan(
            String userId,
            SyncDtos.MutationRequest mutation
    ) {
        if (!"UPSERT".equals(mutation.operation()) || mutation.payload() == null) {
            return rejected(mutation, "SYNC_OPERATION_INVALID");
        }
        JsonNode payload = mutation.payload();
        if (!payload.isObject()) {
            return rejected(mutation, "SYNC_PAYLOAD_INVALID");
        }
        if (!mutation.entityId().equals(text(payload, "id"))
                || text(payload, "localDate") == null
                || text(payload, "timeZone") == null) {
            return rejected(mutation, "SYNC_PAYLOAD_INVALID");
        }
        Long currentRevision = jdbcTemplate.query("""
                SELECT revision FROM daily_plan WHERE user_id = ? AND id = ?
                """,
                resultSet -> resultSet.next() ? resultSet.getLong("revision") : null,
                userId,
                mutation.entityId()
        );
        if (currentRevision != null) {
            if (mutation.baseRevision() != currentRevision) {
                return conflict(mutation, readDailyPlan(userId, mutation.entityId()), "REVISION_CONFLICT");
            }
            long revision = currentRevision + 1;
            jdbcTemplate.update("""
                    UPDATE daily_plan
                    SET plan_date = CAST(? AS date), time_zone = ?, updated_at = ?, revision = ?
                    WHERE user_id = ? AND id = ? AND revision = ?
                    """,
                    text(payload, "localDate"),
                    text(payload, "timeZone"),
                    mutation.occurredAt(),
                    revision,
                    userId,
                    mutation.entityId(),
                    currentRevision
            );
            ObjectNode serverPayload = (ObjectNode) payload.deepCopy();
            serverPayload.put("userId", userId);
            serverPayload.put("revision", revision);
            return appliedChange(
                    userId,
                    mutation,
                    revision,
                    serverPayload,
                    mutation.occurredAt()
            );
        }
        if (mutation.baseRevision() != 0) {
            return conflict(mutation, null, "REVISION_CONFLICT");
        }
        jdbcTemplate.update("""
                INSERT INTO daily_plan (
                    id, user_id, plan_date, time_zone, created_at, updated_at, revision
                ) VALUES (?, ?, CAST(? AS date), ?, ?, ?, 1)
                """,
                mutation.entityId(),
                userId,
                text(payload, "localDate"),
                text(payload, "timeZone"),
                offsetDateTime(payload, "createdAt", mutation.occurredAt()),
                mutation.occurredAt()
        );
        ObjectNode serverPayload = (ObjectNode) payload.deepCopy();
        serverPayload.put("userId", userId);
        serverPayload.put("revision", 1);
        return appliedChange(userId, mutation, 1, serverPayload, mutation.occurredAt());
    }

    private SyncDtos.MutationResult applyDailyPlanItem(
            String userId,
            SyncDtos.MutationRequest mutation
    ) {
        if ("DELETE".equals(mutation.operation())) {
            JsonNode existing = readDailyPlanItem(userId, mutation.entityId());
            if (existing == null) {
                return appliedWithoutChange(mutation, 0);
            }
            jdbcTemplate.update("""
                    DELETE FROM daily_plan_item item
                    USING daily_plan plan
                    WHERE item.daily_plan_id = plan.id
                      AND plan.user_id = ?
                      AND item.id = ?
                    """, userId, mutation.entityId());
            return appliedChange(userId, mutation, 0, existing, mutation.occurredAt());
        }
        if (!"UPSERT".equals(mutation.operation()) || mutation.payload() == null) {
            return rejected(mutation, "SYNC_OPERATION_INVALID");
        }
        JsonNode payload = mutation.payload();
        String planId = text(payload, "planId");
        String taskId = text(payload, "taskId");
        String section = text(payload, "section");
        if (!mutation.entityId().equals(text(payload, "id"))
                || planId == null
                || taskId == null
                || !List.of("FOCUS", "LATER").contains(section)
                || !dailyPlanBelongsTo(userId, planId)
                || tasks.findById(userId, taskId)
                        .filter(task -> task.status() == TaskStatus.READY
                                || task.status() == TaskStatus.DOING)
                        .isEmpty()) {
            return rejected(mutation, "SYNC_PAYLOAD_INVALID");
        }
        if ("FOCUS".equals(section)) {
            jdbcTemplate.queryForObject(
                    "SELECT pg_advisory_xact_lock(hashtext(?)) IS NULL",
                    Boolean.class,
                    "daily-focus:" + userId + ":" + planId
            );
            Integer focusCount = jdbcTemplate.queryForObject("""
                    SELECT count(*) FROM daily_plan_item
                    WHERE daily_plan_id = ? AND section = 'FOCUS' AND id <> ?
                    """, Integer.class, planId, mutation.entityId());
            if (focusCount != null && focusCount >= 3) {
                return rejected(mutation, "DAILY_FOCUS_LIMIT_EXCEEDED");
            }
        }
        jdbcTemplate.update("""
                INSERT INTO daily_plan_item (
                    id, daily_plan_id, task_id, section, sort_key, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (daily_plan_id, task_id) DO UPDATE SET
                    section = EXCLUDED.section,
                    sort_key = EXCLUDED.sort_key
                """,
                mutation.entityId(),
                planId,
                taskId,
                section,
                text(payload, "sortKey"),
                offsetDateTime(payload, "createdAt", mutation.occurredAt())
        );
        return appliedChange(userId, mutation, 0, payload, mutation.occurredAt());
    }

    private SyncDtos.MutationResult appliedChange(
            String userId,
            SyncDtos.MutationRequest mutation,
            long revision,
            JsonNode payload,
            OffsetDateTime occurredAt
    ) {
        long sequence = syncRepository.appendChange(
                userId,
                mutation.entityType(),
                mutation.entityId(),
                mutation.operation(),
                revision,
                payload,
                occurredAt
        );
        return new SyncDtos.MutationResult(
                mutation.clientMutationId(),
                "APPLIED",
                revision,
                sequence,
                null,
                payload
        );
    }

    private SyncDtos.MutationResult appliedWithoutChange(
            SyncDtos.MutationRequest mutation,
            long revision
    ) {
        return new SyncDtos.MutationResult(
                mutation.clientMutationId(),
                "APPLIED",
                revision,
                null,
                null,
                null
        );
    }

    private SyncDtos.MutationResult conflict(
            SyncDtos.MutationRequest mutation,
            JsonNode serverPayload,
            String code
    ) {
        Long revision = serverPayload == null || serverPayload.get("revision") == null
                ? null
                : serverPayload.get("revision").asLong();
        return new SyncDtos.MutationResult(
                mutation.clientMutationId(),
                "CONFLICT",
                revision,
                null,
                code,
                serverPayload
        );
    }

    private SyncDtos.MutationResult rejected(
            SyncDtos.MutationRequest mutation,
            String code
    ) {
        return new SyncDtos.MutationResult(
                mutation.clientMutationId(),
                "REJECTED",
                null,
                null,
                code,
                null
        );
    }

    private void saveIfAbsent(
            String userId,
            String deviceId,
            SyncDtos.MutationRequest mutation,
            SyncDtos.MutationResult result
    ) {
        if (syncRepository.findResult(userId, mutation.clientMutationId()).isEmpty()) {
            syncRepository.saveResult(userId, deviceId, mutation, result);
        }
    }

    private TaskView readTask(String userId, SyncDtos.MutationRequest mutation) {
        try {
            ObjectNode normalized = (ObjectNode) mutation.payload().deepCopy();
            normalized.put("userId", userId);
            normalized.remove(List.of("areaId", "deletedAt"));
            normalizeDateOnly(normalized, "deadlineAt", "T23:59:59Z");
            normalizeDateOnly(normalized, "reviewAt", "T00:00:00Z");
            TaskView task = jsonMapper.treeToValue(normalized, TaskView.class);
            if (!task.id().equals(mutation.entityId()) || task.title().isBlank()) {
                throw new IllegalArgumentException("Task payload identity is invalid");
            }
            return task;
        } catch (JacksonException | ClassCastException exception) {
            throw new IllegalArgumentException("Task payload is invalid", exception);
        }
    }

    private void normalizeDateOnly(ObjectNode payload, String field, String suffix) {
        JsonNode value = payload.get(field);
        if (value != null && value.isTextual() && value.asString().length() == 10) {
            payload.put(field, value.asString() + suffix);
        }
    }

    private TaskView taskWithRevision(
            TaskView source,
            String userId,
            long revision,
            OffsetDateTime createdAt
    ) {
        return new TaskView(
                source.id(),
                userId,
                source.projectId(),
                source.workPackageId(),
                source.title(),
                source.note(),
                source.status(),
                source.visibility(),
                source.deadlineAt(),
                source.reviewAt(),
                source.reviewedAt(),
                source.waitingFor(),
                source.waitingSince(),
                source.estimateMinutes(),
                source.energyLevel(),
                source.sortKey(),
                source.completedAt(),
                source.canceledAt(),
                createdAt,
                source.updatedAt(),
                revision
        );
    }

    private ProjectView projectWithRevision(
            ProjectView source,
            String userId,
            long revision,
            OffsetDateTime createdAt
    ) {
        return new ProjectView(
                source.id(),
                userId,
                source.name(),
                source.note(),
                source.status(),
                source.sortKey(),
                createdAt,
                source.updatedAt(),
                revision
        );
    }

    private WorkPackageView workPackageWithRevision(
            WorkPackageView source,
            String userId,
            long revision,
            OffsetDateTime createdAt
    ) {
        return new WorkPackageView(
                source.id(),
                userId,
                source.projectId(),
                source.parentId(),
                source.title(),
                source.note(),
                source.sortKey(),
                createdAt,
                source.updatedAt(),
                null,
                revision
        );
    }

    private boolean projectIsValid(String userId, String projectId) {
        return projectId == null || projects.findById(userId, projectId).isPresent();
    }

    private boolean workPackageIsValid(
            String userId,
            String projectId,
            String workPackageId
    ) {
        if (workPackageId == null) {
            return true;
        }
        if (projectId == null) {
            return false;
        }
        return workPackages.findById(userId, workPackageId)
                .map(value -> Objects.equals(value.projectId(), projectId))
                .orElse(false);
    }

    private boolean workPackageParentIsValid(
            String userId,
            WorkPackageView workPackage
    ) {
        if (workPackage.parentId() == null) {
            return true;
        }
        if (workPackage.parentId().equals(workPackage.id())) {
            return false;
        }
        return workPackages.findById(userId, workPackage.parentId())
                .map(parent -> Objects.equals(parent.projectId(), workPackage.projectId())
                        && parent.parentId() == null)
                .orElse(false);
    }

    private boolean dailyPlanBelongsTo(String userId, String planId) {
        Boolean exists = jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM daily_plan WHERE user_id = ? AND id = ?
                )
                """, Boolean.class, userId, planId);
        return Boolean.TRUE.equals(exists);
    }

    private JsonNode readDailyPlan(String userId, String planId) {
        return jdbcTemplate.query("""
                SELECT id, user_id, plan_date, time_zone,
                       created_at, updated_at, revision
                FROM daily_plan
                WHERE user_id = ? AND id = ?
                """,
                resultSet -> {
                    if (!resultSet.next()) {
                        return null;
                    }
                    ObjectNode value = jsonMapper.createObjectNode();
                    value.put("id", resultSet.getString("id"));
                    value.put("userId", resultSet.getString("user_id"));
                    value.put("localDate", resultSet.getString("plan_date"));
                    value.put("timeZone", resultSet.getString("time_zone"));
                    value.put("createdAt", resultSet.getObject("created_at").toString());
                    value.put("updatedAt", resultSet.getObject("updated_at").toString());
                    value.put("revision", resultSet.getLong("revision"));
                    return value;
                },
                userId,
                planId
        );
    }

    private JsonNode readDailyPlanItem(String userId, String itemId) {
        return jdbcTemplate.query("""
                SELECT item.id, item.daily_plan_id, item.task_id, item.section,
                       item.sort_key, item.created_at
                FROM daily_plan_item item
                JOIN daily_plan plan ON plan.id = item.daily_plan_id
                WHERE plan.user_id = ? AND item.id = ?
                """,
                resultSet -> {
                    if (!resultSet.next()) {
                        return null;
                    }
                    ObjectNode value = jsonMapper.createObjectNode();
                    value.put("id", resultSet.getString("id"));
                    value.put("planId", resultSet.getString("daily_plan_id"));
                    value.put("taskId", resultSet.getString("task_id"));
                    value.put("section", resultSet.getString("section"));
                    value.put("sortKey", resultSet.getString("sort_key"));
                    value.put("createdAt", resultSet.getObject("created_at").toString());
                    return value;
                },
                userId,
                itemId
        );
    }

    private String text(JsonNode payload, String field) {
        if (payload == null || payload.get(field) == null || payload.get(field).isNull()) {
            return null;
        }
        return payload.get(field).asString();
    }

    private OffsetDateTime offsetDateTime(
            JsonNode payload,
            String field,
            OffsetDateTime fallback
    ) {
        String value = text(payload, field);
        return value == null ? fallback : OffsetDateTime.parse(value);
    }

    private OffsetDateTime later(OffsetDateTime left, OffsetDateTime right) {
        return left.isAfter(right) ? left : right;
    }

    private OffsetDateTime firstNonNull(OffsetDateTime first, OffsetDateTime second) {
        return first == null ? second : first;
    }

    private String eventType(TaskStatus from, TaskStatus to) {
        if (to == TaskStatus.COMPLETED) {
            return "COMPLETED";
        }
        if (to == TaskStatus.CANCELED) {
            return "CANCELED";
        }
        if (from.terminal()) {
            return "REOPENED";
        }
        if (to == TaskStatus.WAITING) {
            return "WAITING_STARTED";
        }
        if (from == TaskStatus.WAITING) {
            return "WAITING_ENDED";
        }
        if (from == TaskStatus.INBOX && to == TaskStatus.READY) {
            return "CLARIFIED";
        }
        return "STATUS_CHANGED";
    }
}
