package com.nextone.project;

import java.time.OffsetDateTime;

public record ProjectView(
        String id,
        String userId,
        String name,
        String note,
        ProjectStatus status,
        String focusTaskId,
        String sortKey,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        long revision
) {
}
