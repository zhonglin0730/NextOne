package com.nextone.event;

import java.time.OffsetDateTime;
import tools.jackson.databind.JsonNode;

public record TaskEventView(
        String id,
        String taskId,
        String type,
        JsonNode metadata,
        OffsetDateTime occurredAt
) {
}
