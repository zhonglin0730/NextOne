package com.nextone.review;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.nextone.project.ProjectRepository;
import com.nextone.task.TaskRepository;
import com.nextone.task.TaskStatus;
import com.nextone.task.TaskView;
import com.nextone.task.TaskVisibility;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class ReviewServiceTest {

    @Test
    void includesStaleReadyWorkAndUsesReviewedAtToSuppressIt() {
        TaskRepository tasks = mock(TaskRepository.class);
        ProjectRepository projects = mock(ProjectRepository.class);
        ReviewSessionRepository sessions = mock(ReviewSessionRepository.class);
        Clock clock = Clock.fixed(Instant.parse("2026-07-25T12:00:00Z"), ZoneOffset.UTC);
        ReviewService service = new ReviewService(tasks, projects, sessions, clock);

        TaskView stale = task("stale", "2026-07-01T12:00:00Z", null);
        TaskView recentlyReviewed = task(
                "reviewed",
                "2026-07-01T12:00:00Z",
                "2026-07-24T12:00:00Z"
        );
        when(tasks.list("local-user", false)).thenReturn(List.of(stale, recentlyReviewed));
        when(projects.list("local-user")).thenReturn(List.of());

        ReviewQueueView queue = service.queue(
                "local-user",
                OffsetDateTime.parse("2026-07-25T12:00:00Z")
        );

        assertThat(queue.tasks()).hasSize(1);
        assertThat(queue.tasks().get(0).task().id()).isEqualTo("stale");
        assertThat(queue.tasks().get(0).reasons()).containsExactly("STALE");
    }

    private TaskView task(String id, String updatedAt, String reviewedAt) {
        OffsetDateTime created = OffsetDateTime.parse("2026-06-01T12:00:00Z");
        return new TaskView(
                id,
                "local-user",
                null,
                null,
                id,
                null,
                TaskStatus.READY,
                TaskVisibility.ACTIVE,
                null,
                null,
                reviewedAt == null ? null : OffsetDateTime.parse(reviewedAt),
                null,
                null,
                null,
                null,
                id,
                null,
                null,
                created,
                OffsetDateTime.parse(updatedAt),
                2
        );
    }
}
