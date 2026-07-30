package com.nextone.task;

import java.time.OffsetDateTime;

public record TaskView(
        String id,
        String userId,
        String projectId,
        String parentTaskId,
        TaskKind kind,
        String title,
        String note,
        TaskStatus status,
        TaskVisibility visibility,
        OffsetDateTime deadlineAt,
        OffsetDateTime reviewAt,
        OffsetDateTime reviewedAt,
        String waitingFor,
        OffsetDateTime waitingSince,
        Integer estimateMinutes,
        EnergyLevel energyLevel,
        String sortKey,
        OffsetDateTime completedAt,
        OffsetDateTime canceledAt,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        long revision
) {
}
