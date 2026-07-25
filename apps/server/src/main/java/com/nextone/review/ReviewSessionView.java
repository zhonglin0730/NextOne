package com.nextone.review;

import java.time.LocalDate;
import java.time.OffsetDateTime;

public record ReviewSessionView(
        String id,
        String userId,
        String reviewType,
        LocalDate periodStart,
        LocalDate periodEnd,
        String status,
        OffsetDateTime startedAt,
        OffsetDateTime completedAt,
        OffsetDateTime createdAt
) {
}
