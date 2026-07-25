package com.nextone.account;

import com.nextone.auth.CurrentUser;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/account/deletion-requests")
public class AccountDeletionController {

    private final CurrentUser currentUser;
    private final JdbcTemplate jdbcTemplate;

    public AccountDeletionController(CurrentUser currentUser, JdbcTemplate jdbcTemplate) {
        this.currentUser = currentUser;
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostMapping
    DeletionRequest createRequest() {
        String userId = currentUser.id();
        OffsetDateTime createdAt = OffsetDateTime.now(ZoneOffset.UTC);
        OffsetDateTime expiresAt = createdAt.plusMinutes(30);
        String requestId = UUID.randomUUID().toString();
        jdbcTemplate.update("""
                UPDATE account_deletion_request
                SET status = 'CANCELED'
                WHERE user_id = ? AND status = 'AWAITING_FINAL_CONFIRMATION'
                """, userId);
        jdbcTemplate.update("""
                INSERT INTO account_deletion_request (
                    id, user_id, status, created_at, expires_at
                ) VALUES (?, ?, 'AWAITING_FINAL_CONFIRMATION', ?, ?)
                """, requestId, userId, createdAt, expiresAt);
        return new DeletionRequest(
                requestId,
                "AWAITING_FINAL_CONFIRMATION",
                createdAt,
                expiresAt,
                true,
                false
        );
    }

    record DeletionRequest(
            String requestId,
            String status,
            OffsetDateTime createdAt,
            OffsetDateTime expiresAt,
            boolean backupConfirmationRequired,
            boolean finalDeletionAvailable
    ) {
    }
}
