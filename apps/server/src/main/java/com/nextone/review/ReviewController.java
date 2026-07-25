package com.nextone.review;

import com.nextone.auth.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/reviews")
public class ReviewController {

    private final CurrentUser currentUser;
    private final ReviewService service;
    private final Clock clock;

    public ReviewController(CurrentUser currentUser, ReviewService service, Clock clock) {
        this.currentUser = currentUser;
        this.service = service;
        this.clock = clock;
    }

    @GetMapping("/queue")
    ReviewQueueView queue() {
        return service.queue(currentUser.id(), OffsetDateTime.now(clock));
    }

    @GetMapping("/sessions")
    List<ReviewSessionView> sessions() {
        return service.listSessions(currentUser.id());
    }

    @PostMapping("/sessions")
    @ResponseStatus(HttpStatus.CREATED)
    ReviewSessionView start(@Valid @RequestBody StartReviewRequest request) {
        return service.start(
                currentUser.id(),
                request.reviewType(),
                request.periodStart(),
                request.periodEnd()
        );
    }

    @PostMapping("/sessions/{sessionId}/complete")
    ReviewSessionView complete(@PathVariable String sessionId) {
        return service.complete(currentUser.id(), sessionId);
    }

    public record StartReviewRequest(
            @NotBlank String reviewType,
            LocalDate periodStart,
            LocalDate periodEnd
    ) {
    }
}
