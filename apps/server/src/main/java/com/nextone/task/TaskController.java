package com.nextone.task;

import com.nextone.auth.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/tasks")
public class TaskController {

    private final CurrentUser currentUser;
    private final TaskService service;

    public TaskController(CurrentUser currentUser, TaskService service) {
        this.currentUser = currentUser;
        this.service = service;
    }

    @GetMapping
    List<TaskView> list(@RequestParam(defaultValue = "false") boolean includeCanceled) {
        return service.list(currentUser.id(), includeCanceled);
    }

    @GetMapping("/{taskId}")
    TaskView get(@PathVariable String taskId) {
        return service.get(currentUser.id(), taskId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    TaskView create(@Valid @RequestBody CreateTaskRequest request) {
        return service.create(currentUser.id(), new TaskService.CreateTaskCommand(
                request.title(),
                request.note(),
                request.projectId(),
                request.deadlineAt(),
                request.reviewAt(),
                request.estimateMinutes(),
                request.energyLevel()
        ));
    }

    @PutMapping("/{taskId}")
    TaskView update(@PathVariable String taskId, @Valid @RequestBody UpdateTaskRequest request) {
        return service.update(currentUser.id(), taskId, new TaskService.UpdateTaskCommand(
                request.title(),
                request.note(),
                request.projectId(),
                request.deadlineAt(),
                request.reviewAt(),
                request.estimateMinutes(),
                request.energyLevel(),
                request.revision()
        ));
    }

    @PostMapping("/{taskId}/transition")
    TaskView transition(
            @PathVariable String taskId,
            @Valid @RequestBody TransitionTaskRequest request
    ) {
        return service.transition(
                currentUser.id(),
                taskId,
                request.status(),
                request.allowWipOverride()
        );
    }

    @PostMapping("/{taskId}/visibility")
    TaskView visibility(
            @PathVariable String taskId,
            @Valid @RequestBody ChangeVisibilityRequest request
    ) {
        return service.setVisibility(
                currentUser.id(),
                taskId,
                request.visibility(),
                request.reviewAt()
        );
    }

    @PostMapping("/{taskId}/review")
    TaskView review(@PathVariable String taskId) {
        return service.markReviewed(currentUser.id(), taskId);
    }

    public record CreateTaskRequest(
            @NotBlank String title,
            String note,
            String projectId,
            OffsetDateTime deadlineAt,
            OffsetDateTime reviewAt,
            @Min(1) Integer estimateMinutes,
            EnergyLevel energyLevel
    ) {
    }

    public record UpdateTaskRequest(
            @NotBlank String title,
            String note,
            String projectId,
            OffsetDateTime deadlineAt,
            OffsetDateTime reviewAt,
            @Min(1) Integer estimateMinutes,
            EnergyLevel energyLevel,
            @Min(1) long revision
    ) {
    }

    public record TransitionTaskRequest(
            @NotNull TaskStatus status,
            boolean allowWipOverride
    ) {
    }

    public record ChangeVisibilityRequest(
            @NotNull TaskVisibility visibility,
            OffsetDateTime reviewAt
    ) {
    }
}
