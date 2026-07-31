package com.nextone.task;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.nextone.event.TaskEventRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class TaskServiceTest {

    @Test
    void clearsWaitingContextWhenWorkResumes() {
        TaskRepository tasks = mock(TaskRepository.class);
        TaskEventRepository events = mock(TaskEventRepository.class);
        Clock clock = Clock.fixed(Instant.parse("2026-07-31T08:00:00Z"), ZoneOffset.UTC);
        TaskService service = new TaskService(tasks, events, clock);
        TaskView waiting = new TaskView(
                "task-1",
                "local-user",
                null,
                null,
                "Waiting task",
                null,
                TaskStatus.WAITING,
                TaskVisibility.ACTIVE,
                null,
                OffsetDateTime.parse("2026-08-01T00:00:00Z"),
                null,
                "Customer reply",
                OffsetDateTime.parse("2026-07-30T08:00:00Z"),
                null,
                null,
                "task-1",
                null,
                null,
                OffsetDateTime.parse("2026-07-20T08:00:00Z"),
                OffsetDateTime.parse("2026-07-30T08:00:00Z"),
                3
        );
        when(tasks.findById("local-user", "task-1")).thenReturn(Optional.of(waiting));

        TaskView resumed = service.transition("local-user", "task-1", TaskStatus.READY, false);

        assertThat(resumed.reviewAt()).isNull();
        assertThat(resumed.waitingFor()).isNull();
        assertThat(resumed.waitingSince()).isNull();
        ArgumentCaptor<TaskView> saved = ArgumentCaptor.forClass(TaskView.class);
        verify(tasks).update(saved.capture());
        assertThat(saved.getValue()).isEqualTo(resumed);
    }
}
