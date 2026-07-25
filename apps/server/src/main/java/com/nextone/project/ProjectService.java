package com.nextone.project;

import com.nextone.common.ApiException;
import com.nextone.event.TaskEventRepository;
import com.nextone.task.TaskRepository;
import com.nextone.task.TaskStatus;
import com.nextone.task.TaskView;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProjectService {

    private final ProjectRepository repository;
    private final TaskRepository tasks;
    private final TaskEventRepository events;
    private final Clock clock;

    public ProjectService(
            ProjectRepository repository,
            TaskRepository tasks,
            TaskEventRepository events,
            Clock clock
    ) {
        this.repository = repository;
        this.tasks = tasks;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public ProjectView create(String userId, String name, String note) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        String id = UUID.randomUUID().toString();
        ProjectView project = new ProjectView(
                id,
                userId,
                requireName(name),
                trimToNull(note),
                ProjectStatus.ACTIVE,
                null,
                now + ":" + id,
                now,
                now,
                1
        );
        repository.insert(project);
        return project;
    }

    public List<ProjectView> list(String userId) {
        return repository.list(userId);
    }

    public ProjectDetail get(String userId, String projectId) {
        ProjectView project = requireProject(userId, projectId);
        return new ProjectDetail(project, tasks.listByProject(userId, projectId));
    }

    @Transactional
    public ProjectView update(
            String userId,
            String projectId,
            String name,
            String note,
            ProjectStatus status,
            long revision
    ) {
        ProjectView current = requireProject(userId, projectId);
        validateRevision(current, revision);
        OffsetDateTime now = OffsetDateTime.now(clock);
        ProjectView updated = new ProjectView(
                current.id(),
                current.userId(),
                requireName(name),
                trimToNull(note),
                status,
                status == ProjectStatus.ACTIVE ? current.focusTaskId() : null,
                current.sortKey(),
                current.createdAt(),
                now,
                current.revision() + 1
        );
        repository.update(updated);
        return updated;
    }

    @Transactional
    public ProjectView setFocus(String userId, String projectId, String taskId) {
        ProjectView project = requireProject(userId, projectId);
        if (project.status() != ProjectStatus.ACTIVE) {
            throw new ApiException(HttpStatus.CONFLICT, "PROJECT_NOT_ACTIVE");
        }
        TaskView nextFocus = null;
        if (taskId != null) {
            nextFocus = tasks.findById(userId, taskId)
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TASK_NOT_FOUND"));
            if (!projectId.equals(nextFocus.projectId())
                    || nextFocus.status() == TaskStatus.INBOX
                    || nextFocus.status().terminal()) {
                throw new ApiException(HttpStatus.CONFLICT, "PROJECT_FOCUS_TASK_INVALID");
            }
        }
        if ((project.focusTaskId() == null && taskId == null)
                || (project.focusTaskId() != null && project.focusTaskId().equals(taskId))) {
            return project;
        }

        OffsetDateTime now = OffsetDateTime.now(clock);
        ProjectView updated = new ProjectView(
                project.id(),
                project.userId(),
                project.name(),
                project.note(),
                project.status(),
                taskId,
                project.sortKey(),
                project.createdAt(),
                now,
                project.revision() + 1
        );
        repository.update(updated);
        if (project.focusTaskId() != null) {
            events.append(userId, project.focusTaskId(), "PROJECT_FOCUS_CLEARED", Map.of(
                    "projectId", projectId
            ), now);
        }
        if (nextFocus != null) {
            events.append(userId, nextFocus.id(), "PROJECT_FOCUS_SET", Map.of(
                    "projectId", projectId
            ), now);
        }
        return updated;
    }

    private ProjectView requireProject(String userId, String projectId) {
        return repository.findById(userId, projectId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "PROJECT_NOT_FOUND"));
    }

    private void validateRevision(ProjectView project, long revision) {
        if (project.revision() != revision) {
            throw new ApiException(HttpStatus.CONFLICT, "REVISION_CONFLICT", Map.of(
                    "expected", project.revision(),
                    "received", revision
            ));
        }
    }

    private String requireName(String value) {
        String name = value == null ? "" : value.trim();
        if (name.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PROJECT_NAME_REQUIRED");
        }
        return name;
    }

    private String trimToNull(String value) {
        return value == null || value.trim().isEmpty() ? null : value.trim();
    }

    public record ProjectDetail(ProjectView project, List<TaskView> tasks) {
    }
}
