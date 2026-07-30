package com.nextone.task;

import com.nextone.common.ApiException;
import com.nextone.event.TaskEventRepository;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TaskService {

    public static final int DOING_LIMIT = 3;

    private final TaskRepository repository;
    private final TaskEventRepository events;
    private final Clock clock;

    public TaskService(TaskRepository repository, TaskEventRepository events, Clock clock) {
        this.repository = repository;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public TaskView create(String userId, CreateTaskCommand command) {
        String title = requireTitle(command.title());
        validateProject(userId, command.projectId());
        OffsetDateTime now = OffsetDateTime.now(clock);
        String id = UUID.randomUUID().toString();
        TaskView task = new TaskView(
                id,
                userId,
                command.projectId(),
                null,
                TaskKind.ACTION,
                title,
                trimToNull(command.note()),
                TaskStatus.INBOX,
                TaskVisibility.ACTIVE,
                command.deadlineAt(),
                command.reviewAt(),
                null,
                null,
                null,
                command.estimateMinutes(),
                command.energyLevel(),
                now + ":" + id,
                null,
                null,
                now,
                now,
                1
        );
        repository.insert(task);
        events.append(userId, task.id(), "CREATED", Map.of(), now);
        return task;
    }

    public List<TaskView> list(String userId, boolean includeCanceled) {
        return repository.list(userId, includeCanceled);
    }

    public TaskView get(String userId, String taskId) {
        return repository.findById(userId, taskId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TASK_NOT_FOUND"));
    }

    @Transactional
    public TaskView update(String userId, String taskId, UpdateTaskCommand command) {
        TaskView current = get(userId, taskId);
        validateRevision(current, command.revision());
        validateProject(userId, command.projectId());
        OffsetDateTime now = OffsetDateTime.now(clock);
        TaskView updated = copy(
                current,
                command.projectId(),
                requireTitle(command.title()),
                trimToNull(command.note()),
                current.status(),
                current.visibility(),
                command.deadlineAt(),
                command.reviewAt(),
                current.reviewedAt(),
                current.waitingFor(),
                current.waitingSince(),
                command.estimateMinutes(),
                command.energyLevel(),
                current.completedAt(),
                current.canceledAt(),
                now
        );
        repository.update(updated);
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("fieldNames", List.of(
                "title", "note", "projectId", "deadlineAt", "reviewAt",
                "estimateMinutes", "energyLevel"
        ));
        events.append(userId, taskId, "CLARIFIED", metadata, now);
        return updated;
    }

    @Transactional
    public TaskView transition(
            String userId,
            String taskId,
            TaskStatus target,
            boolean allowWipOverride
    ) {
        TaskView current = get(userId, taskId);
        if (current.kind() == TaskKind.WORK_PACKAGE
                && !(current.status() == TaskStatus.INBOX && target == TaskStatus.READY)) {
            throw new ApiException(HttpStatus.CONFLICT, "TASK_WORK_PACKAGE_TRANSITION_INVALID");
        }
        if (!current.status().canTransitionTo(target)) {
            throw new ApiException(HttpStatus.CONFLICT, "TASK_TRANSITION_INVALID", Map.of(
                    "from", current.status().name(),
                    "to", target.name()
            ));
        }
        if (current.status() == target) {
            return current;
        }
        boolean overrodeWipLimit = false;
        if (target == TaskStatus.DOING && current.status() != TaskStatus.DOING) {
            repository.lockWipDecision(userId);
            long doingCount = repository.countDoing(userId);
            if (doingCount >= DOING_LIMIT && !allowWipOverride) {
                throw new ApiException(HttpStatus.CONFLICT, "WIP_LIMIT_EXCEEDED", Map.of(
                        "limit", DOING_LIMIT,
                        "activeCount", doingCount
                ));
            }
            overrodeWipLimit = doingCount >= DOING_LIMIT;
        }

        OffsetDateTime now = OffsetDateTime.now(clock);
        TaskView updated = copy(
                current,
                current.projectId(),
                current.title(),
                current.note(),
                target,
                current.visibility(),
                current.deadlineAt(),
                current.reviewAt(),
                current.reviewedAt(),
                target == TaskStatus.WAITING ? current.waitingFor() : null,
                target == TaskStatus.WAITING ? now : null,
                current.estimateMinutes(),
                current.energyLevel(),
                target == TaskStatus.COMPLETED ? now : null,
                target == TaskStatus.CANCELED ? now : null,
                now
        );
        repository.update(updated);

        String eventType = eventType(current.status(), target);
        events.append(userId, taskId, eventType, Map.of(
                "fromStatus", current.status().name(),
                "toStatus", target.name()
        ), now);
        if (overrodeWipLimit) {
            events.append(userId, taskId, "WIP_LIMIT_OVERRIDDEN", Map.of(
                    "limit", DOING_LIMIT
            ), now);
        }
        if (target.terminal()) {
            if (repository.clearProjectFocusForTask(userId, taskId, now)) {
                events.append(userId, taskId, "PROJECT_FOCUS_CLEARED", Map.of(), now);
            }
        }
        return updated;
    }

    @Transactional
    public TaskView setVisibility(
            String userId,
            String taskId,
            TaskVisibility visibility,
            OffsetDateTime reviewAt
    ) {
        TaskView current = get(userId, taskId);
        if (current.status().terminal()) {
            throw new ApiException(HttpStatus.CONFLICT, "TASK_TERMINAL");
        }
        OffsetDateTime now = OffsetDateTime.now(clock);
        TaskView updated = copy(
                current,
                current.projectId(),
                current.title(),
                current.note(),
                current.status(),
                visibility,
                current.deadlineAt(),
                reviewAt,
                current.reviewedAt(),
                current.waitingFor(),
                current.waitingSince(),
                current.estimateMinutes(),
                current.energyLevel(),
                current.completedAt(),
                current.canceledAt(),
                now
        );
        repository.update(updated);
        events.append(userId, taskId, "VISIBILITY_CHANGED", Map.of(
                "fromVisibility", current.visibility().name(),
                "toVisibility", visibility.name()
        ), now);
        if (reviewAt != null) {
            events.append(userId, taskId, "REVIEW_AT_CHANGED", Map.of(), now);
        }
        return updated;
    }

    @Transactional
    public TaskView markReviewed(String userId, String taskId) {
        TaskView current = get(userId, taskId);
        if (current.status() != TaskStatus.READY) {
            throw new ApiException(HttpStatus.CONFLICT, "TASK_REVIEW_REQUIRES_READY");
        }
        OffsetDateTime now = OffsetDateTime.now(clock);
        TaskView updated = copy(
                current,
                current.projectId(),
                current.title(),
                current.note(),
                current.status(),
                TaskVisibility.ACTIVE,
                current.deadlineAt(),
                current.reviewAt(),
                now,
                current.waitingFor(),
                current.waitingSince(),
                current.estimateMinutes(),
                current.energyLevel(),
                current.completedAt(),
                current.canceledAt(),
                now
        );
        repository.update(updated);
        events.append(userId, taskId, "REVIEWED", Map.of(), now);
        return updated;
    }

    private void validateProject(String userId, String projectId) {
        if (projectId != null && !repository.projectExists(userId, projectId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "PROJECT_NOT_FOUND");
        }
    }

    private void validateRevision(TaskView task, long revision) {
        if (task.revision() != revision) {
            throw new ApiException(HttpStatus.CONFLICT, "REVISION_CONFLICT", Map.of(
                    "expected", task.revision(),
                    "received", revision
            ));
        }
    }

    private String requireTitle(String value) {
        String title = value == null ? "" : value.trim();
        if (title.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TASK_TITLE_REQUIRED");
        }
        return title;
    }

    private String trimToNull(String value) {
        if (value == null || value.trim().isEmpty()) {
            return null;
        }
        return value.trim();
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

    private TaskView copy(
            TaskView source,
            String projectId,
            String title,
            String note,
            TaskStatus status,
            TaskVisibility visibility,
            OffsetDateTime deadlineAt,
            OffsetDateTime reviewAt,
            OffsetDateTime reviewedAt,
            String waitingFor,
            OffsetDateTime waitingSince,
            Integer estimateMinutes,
            EnergyLevel energyLevel,
            OffsetDateTime completedAt,
            OffsetDateTime canceledAt,
            OffsetDateTime updatedAt
    ) {
        return new TaskView(
                source.id(),
                source.userId(),
                projectId,
                source.parentTaskId(),
                source.kind(),
                title,
                note,
                status,
                visibility,
                deadlineAt,
                reviewAt,
                reviewedAt,
                waitingFor,
                waitingSince,
                estimateMinutes,
                energyLevel,
                source.sortKey(),
                completedAt,
                canceledAt,
                source.createdAt(),
                updatedAt,
                source.revision() + 1
        );
    }

    public record CreateTaskCommand(
            String title,
            String note,
            String projectId,
            OffsetDateTime deadlineAt,
            OffsetDateTime reviewAt,
            Integer estimateMinutes,
            EnergyLevel energyLevel
    ) {
    }

    public record UpdateTaskCommand(
            String title,
            String note,
            String projectId,
            OffsetDateTime deadlineAt,
            OffsetDateTime reviewAt,
            Integer estimateMinutes,
            EnergyLevel energyLevel,
            long revision
    ) {
    }
}
