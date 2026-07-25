package com.nextone.event;

import com.nextone.auth.CurrentUser;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/events")
public class TaskEventController {

    private final CurrentUser currentUser;
    private final TaskEventRepository repository;

    public TaskEventController(CurrentUser currentUser, TaskEventRepository repository) {
        this.currentUser = currentUser;
        this.repository = repository;
    }

    @GetMapping
    List<TaskEventView> list(@RequestParam(defaultValue = "100") int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 500));
        return repository.list(currentUser.id(), safeLimit);
    }
}
