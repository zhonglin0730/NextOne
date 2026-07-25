package com.nextone.project;

import com.nextone.auth.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/projects")
public class ProjectController {

    private final CurrentUser currentUser;
    private final ProjectService service;

    public ProjectController(CurrentUser currentUser, ProjectService service) {
        this.currentUser = currentUser;
        this.service = service;
    }

    @GetMapping
    List<ProjectView> list() {
        return service.list(currentUser.id());
    }

    @GetMapping("/{projectId}")
    ProjectService.ProjectDetail get(@PathVariable String projectId) {
        return service.get(currentUser.id(), projectId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    ProjectView create(@Valid @RequestBody CreateProjectRequest request) {
        return service.create(currentUser.id(), request.name(), request.note());
    }

    @PutMapping("/{projectId}")
    ProjectView update(
            @PathVariable String projectId,
            @Valid @RequestBody UpdateProjectRequest request
    ) {
        return service.update(
                currentUser.id(),
                projectId,
                request.name(),
                request.note(),
                request.status(),
                request.revision()
        );
    }

    @PostMapping("/{projectId}/focus")
    ProjectView setFocus(
            @PathVariable String projectId,
            @RequestBody FocusRequest request
    ) {
        return service.setFocus(currentUser.id(), projectId, request.taskId());
    }

    public record CreateProjectRequest(@NotBlank String name, String note) {
    }

    public record UpdateProjectRequest(
            @NotBlank String name,
            String note,
            @NotNull ProjectStatus status,
            @Min(1) long revision
    ) {
    }

    public record FocusRequest(String taskId) {
    }
}
