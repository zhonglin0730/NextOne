package com.nextone.bootstrap;

import com.nextone.auth.CurrentUser;
import com.nextone.auth.SingleUserPrincipal;
import com.nextone.dailyplan.DailyPlanRepository;
import com.nextone.dailyplan.DailyPlanView;
import com.nextone.event.TaskEventRepository;
import com.nextone.event.TaskEventView;
import com.nextone.project.ProjectRepository;
import com.nextone.project.ProjectView;
import com.nextone.review.ReviewSessionRepository;
import com.nextone.review.ReviewSessionView;
import com.nextone.task.TaskRepository;
import com.nextone.task.TaskView;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/bootstrap")
public class BootstrapController {

    private final CurrentUser currentUser;
    private final TaskRepository tasks;
    private final ProjectRepository projects;
    private final DailyPlanRepository dailyPlans;
    private final ReviewSessionRepository reviewSessions;
    private final TaskEventRepository events;

    public BootstrapController(
            CurrentUser currentUser,
            TaskRepository tasks,
            ProjectRepository projects,
            DailyPlanRepository dailyPlans,
            ReviewSessionRepository reviewSessions,
            TaskEventRepository events
    ) {
        this.currentUser = currentUser;
        this.tasks = tasks;
        this.projects = projects;
        this.dailyPlans = dailyPlans;
        this.reviewSessions = reviewSessions;
        this.events = events;
    }

    @GetMapping
    BootstrapResponse bootstrap() {
        SingleUserPrincipal user = currentUser.get();
        return new BootstrapResponse(
                2,
                user,
                tasks.list(user.id(), true),
                projects.list(user.id()),
                dailyPlans.listAll(user.id()),
                reviewSessions.list(user.id()),
                events.list(user.id(), 500)
        );
    }

    public record BootstrapResponse(
            int schemaVersion,
            SingleUserPrincipal user,
            List<TaskView> tasks,
            List<ProjectView> projects,
            List<DailyPlanView> dailyPlans,
            List<ReviewSessionView> reviewSessions,
            List<TaskEventView> recentEvents
    ) {
    }
}
