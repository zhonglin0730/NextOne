package com.nextone.sync;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.OffsetDateTime;
import java.util.List;
import tools.jackson.databind.JsonNode;

public final class SyncDtos {

    private SyncDtos() {
    }

    public record PushRequest(
            @NotBlank String deviceId,
            @NotNull List<@Valid MutationRequest> mutations
    ) {
    }

    public record MutationRequest(
            @NotBlank String clientMutationId,
            @NotBlank String entityType,
            @NotBlank String entityId,
            @NotBlank String operation,
            @Min(0) long baseRevision,
            @NotNull OffsetDateTime occurredAt,
            JsonNode payload
    ) {
    }

    public record PushResponse(List<MutationResult> results) {
    }

    public record MutationResult(
            String clientMutationId,
            String status,
            Long revision,
            Long serverSequence,
            String errorCode,
            JsonNode serverPayload
    ) {
    }

    public record PullResponse(
            long nextCursor,
            boolean hasMore,
            List<Change> changes
    ) {
    }

    public record Change(
            long serverSequence,
            String entityType,
            String entityId,
            String operation,
            long revision,
            JsonNode payload,
            OffsetDateTime createdAt
    ) {
    }

    public record PullQuery(
            @Min(0) long cursor,
            @Min(1) @Max(500) int limit
    ) {
    }
}
