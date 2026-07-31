package com.nextone.workpackage;

import java.time.OffsetDateTime;

public record WorkPackageView(
        String id,
        String userId,
        String projectId,
        String parentId,
        String title,
        String note,
        String sortKey,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        OffsetDateTime deletedAt,
        long revision
) {
}
