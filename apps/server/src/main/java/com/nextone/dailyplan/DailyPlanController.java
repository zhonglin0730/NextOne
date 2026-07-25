package com.nextone.dailyplan;

import com.nextone.auth.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/daily-plans")
public class DailyPlanController {

    private final CurrentUser currentUser;
    private final DailyPlanService service;

    public DailyPlanController(CurrentUser currentUser, DailyPlanService service) {
        this.currentUser = currentUser;
        this.service = service;
    }

    @GetMapping("/{date}")
    DailyPlanView get(@PathVariable LocalDate date) {
        return service.get(currentUser.id(), date, currentUser.get().timeZone());
    }

    @PostMapping("/{date}/items")
    DailyPlanView add(
            @PathVariable LocalDate date,
            @Valid @RequestBody AddDailyPlanItemRequest request
    ) {
        return service.add(
                currentUser.id(),
                date,
                request.timeZone(),
                request.taskId(),
                request.section()
        );
    }

    @DeleteMapping("/{date}/items/{taskId}")
    DailyPlanView remove(@PathVariable LocalDate date, @PathVariable String taskId) {
        return service.remove(
                currentUser.id(),
                date,
                taskId,
                currentUser.get().timeZone()
        );
    }

    public record AddDailyPlanItemRequest(
            @NotBlank String taskId,
            @NotNull DailyPlanSection section,
            @NotBlank String timeZone
    ) {
    }
}
