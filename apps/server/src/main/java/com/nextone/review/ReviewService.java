package com.nextone.review;

import com.nextone.common.ApiException;
import com.nextone.project.ProjectRepository;
import com.nextone.project.ProjectStatus;
import com.nextone.project.ProjectView;
import com.nextone.task.TaskRepository;
import com.nextone.task.TaskStatus;
import com.nextone.task.TaskView;
import com.nextone.task.TaskVisibility;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReviewService {

    private final TaskRepository tasks;
    private final ProjectRepository projects;
    private final ReviewSessionRepository sessions;
    private final Clock clock;

    public ReviewService(
            TaskRepository tasks,
            ProjectRepository projects,
            ReviewSessionRepository sessions,
            Clock clock
    ) {
        this.tasks = tasks;
        this.projects = projects;
        this.sessions = sessions;
        this.clock = clock;
    }

    public ReviewQueueView queue(String userId, OffsetDateTime now) {
        List<ReviewQueueView.ReviewTask> queue = new ArrayList<>();
        Map<String, Long> counts = new LinkedHashMap<>();
        for (String reason : List.of(
                "STALE", "WAITING_OVERDUE", "DEADLINE_SOON",
                "REVIEW_DUE", "LONG_DOING", "FOCUSLESS_PROJECT"
        )) {
            counts.put(reason, 0L);
        }

        for (TaskView task : tasks.list(userId, false)) {
            if (task.status().terminal()) {
                continue;
            }
            List<String> reasons = reasons(task, now);
            if (!reasons.isEmpty()) {
                queue.add(new ReviewQueueView.ReviewTask(task, reasons));
                reasons.forEach(reason -> counts.compute(reason, (key, value) -> value + 1));
            }
        }

        List<ProjectView> focusless = projects.list(userId).stream()
                .filter(project -> project.status() == ProjectStatus.ACTIVE)
                .filter(project -> tasks.listByProject(userId, project.id()).stream()
                        .noneMatch(task -> task.visibility() == TaskVisibility.ACTIVE
                                && (task.status() == TaskStatus.READY
                                || task.status() == TaskStatus.DOING)))
                .toList();
        counts.put("FOCUSLESS_PROJECT", (long) focusless.size());
        return new ReviewQueueView(queue, focusless, counts);
    }

    public List<ReviewSessionView> listSessions(String userId) {
        return sessions.list(userId);
    }

    @Transactional
    public ReviewSessionView start(
            String userId,
            String reviewType,
            LocalDate periodStart,
            LocalDate periodEnd
    ) {
        if (!List.of("DAILY", "WEEKLY").contains(reviewType)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "REVIEW_TYPE_INVALID");
        }
        if (periodStart != null && periodEnd != null && periodEnd.isBefore(periodStart)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "REVIEW_PERIOD_INVALID");
        }
        OffsetDateTime now = OffsetDateTime.now(clock);
        ReviewSessionView session = new ReviewSessionView(
                UUID.randomUUID().toString(),
                userId,
                reviewType,
                periodStart,
                periodEnd,
                "OPEN",
                now,
                null,
                now
        );
        sessions.insert(session);
        return session;
    }

    @Transactional
    public ReviewSessionView complete(String userId, String sessionId) {
        ReviewSessionView session = sessions.find(userId, sessionId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "REVIEW_SESSION_NOT_FOUND"
                ));
        if ("COMPLETED".equals(session.status())) {
            return session;
        }
        OffsetDateTime now = OffsetDateTime.now(clock);
        sessions.complete(userId, sessionId, now);
        return sessions.find(userId, sessionId).orElseThrow();
    }

    private List<String> reasons(TaskView task, OffsetDateTime now) {
        List<String> reasons = new ArrayList<>();
        OffsetDateTime meaningful = task.reviewedAt() != null
                && task.reviewedAt().isAfter(task.updatedAt())
                ? task.reviewedAt()
                : task.updatedAt();
        if (task.status() == TaskStatus.READY
                && task.visibility() == TaskVisibility.ACTIVE
                && meaningful.isBefore(now.minus(14, ChronoUnit.DAYS))) {
            reasons.add("STALE");
        }
        if (task.status() == TaskStatus.WAITING
                && task.waitingSince() != null
                && task.waitingSince().isBefore(now.minus(7, ChronoUnit.DAYS))) {
            reasons.add("WAITING_OVERDUE");
        }
        if (task.deadlineAt() != null
                && !task.deadlineAt().isBefore(now)
                && !task.deadlineAt().isAfter(now.plus(3, ChronoUnit.DAYS))) {
            reasons.add("DEADLINE_SOON");
        }
        if (task.reviewAt() != null && !task.reviewAt().isAfter(now)) {
            reasons.add("REVIEW_DUE");
        }
        if (task.status() == TaskStatus.DOING
                && meaningful.isBefore(now.minus(7, ChronoUnit.DAYS))) {
            reasons.add("LONG_DOING");
        }
        return reasons;
    }
}
