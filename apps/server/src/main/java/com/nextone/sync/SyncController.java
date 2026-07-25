package com.nextone.sync;

import com.nextone.auth.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api/v1/sync")
public class SyncController {

    private final CurrentUser currentUser;
    private final SyncService service;

    public SyncController(CurrentUser currentUser, SyncService service) {
        this.currentUser = currentUser;
        this.service = service;
    }

    @PostMapping("/push")
    SyncDtos.PushResponse push(@Valid @RequestBody SyncDtos.PushRequest request) {
        return service.push(currentUser.id(), request);
    }

    @GetMapping("/pull")
    SyncDtos.PullResponse pull(
            @RequestParam(defaultValue = "0") @Min(0) long cursor,
            @RequestParam(defaultValue = "200") @Min(1) @Max(500) int limit
    ) {
        return service.pull(currentUser.id(), cursor, limit);
    }
}
