package com.nextone.task;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

public enum TaskStatus {
    INBOX,
    READY,
    DOING,
    WAITING,
    COMPLETED,
    CANCELED;

    private static final Map<TaskStatus, Set<TaskStatus>> ALLOWED = new EnumMap<>(TaskStatus.class);

    static {
        ALLOWED.put(INBOX, EnumSet.of(READY, WAITING, CANCELED));
        ALLOWED.put(READY, EnumSet.of(DOING, WAITING, COMPLETED, CANCELED));
        ALLOWED.put(DOING, EnumSet.of(READY, WAITING, COMPLETED, CANCELED));
        ALLOWED.put(WAITING, EnumSet.of(READY, DOING, COMPLETED, CANCELED));
        ALLOWED.put(COMPLETED, EnumSet.of(READY));
        ALLOWED.put(CANCELED, EnumSet.of(READY));
    }

    public boolean canTransitionTo(TaskStatus target) {
        return this == target || ALLOWED.get(this).contains(target);
    }

    public boolean terminal() {
        return this == COMPLETED || this == CANCELED;
    }
}
