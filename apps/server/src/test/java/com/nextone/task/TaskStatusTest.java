package com.nextone.task;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class TaskStatusTest {

    @Test
    void enforcesTheSharedTaskStateMachine() {
        assertThat(TaskStatus.INBOX.canTransitionTo(TaskStatus.READY)).isTrue();
        assertThat(TaskStatus.INBOX.canTransitionTo(TaskStatus.DOING)).isFalse();
        assertThat(TaskStatus.COMPLETED.canTransitionTo(TaskStatus.READY)).isTrue();
        assertThat(TaskStatus.COMPLETED.canTransitionTo(TaskStatus.DOING)).isFalse();
        assertThat(TaskStatus.CANCELED.canTransitionTo(TaskStatus.READY)).isTrue();
    }
}
