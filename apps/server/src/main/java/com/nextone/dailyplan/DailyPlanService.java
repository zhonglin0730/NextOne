package com.nextone.dailyplan;

import com.nextone.common.ApiException;
import com.nextone.event.TaskEventRepository;
import com.nextone.task.TaskRepository;
import com.nextone.task.TaskStatus;
import java.time.Clock;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DailyPlanService {

    public static final int FOCUS_LIMIT = 3;

    private final DailyPlanRepository repository;
    private final TaskRepository tasks;
    private final TaskEventRepository events;
    private final Clock clock;

    public DailyPlanService(
            DailyPlanRepository repository,
            TaskRepository tasks,
            TaskEventRepository events,
            Clock clock
    ) {
        this.repository = repository;
        this.tasks = tasks;
        this.events = events;
        this.clock = clock;
    }

    public DailyPlanView get(String userId, LocalDate date, String defaultTimeZone) {
        return repository.find(userId, date)
                .map(repository::toView)
                .orElseGet(() -> empty(userId, date, defaultTimeZone));
    }

    @Transactional
    public DailyPlanView add(
            String userId,
            LocalDate date,
            String timeZone,
            String taskId,
            DailyPlanSection section
    ) {
        validateTimeZone(timeZone);
        repository.lockFocusDecision(userId, date);
        var task = tasks.findById(userId, taskId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TASK_NOT_FOUND"));
        if (task.status() != TaskStatus.READY && task.status() != TaskStatus.DOING) {
            throw new ApiException(HttpStatus.CONFLICT, "TASK_NOT_ACTIONABLE_FOR_TODAY");
        }
        OffsetDateTime now = OffsetDateTime.now(clock);
        DailyPlanRepository.DailyPlanRecord plan = repository.find(userId, date)
                .orElseGet(() -> createPlan(userId, date, timeZone, now));
        var existing = repository.findItem(plan.id(), taskId);
        if (section == DailyPlanSection.FOCUS
                && existing.map(item -> item.section() != DailyPlanSection.FOCUS).orElse(true)
                && repository.countSection(plan.id(), DailyPlanSection.FOCUS) >= FOCUS_LIMIT) {
            throw new ApiException(HttpStatus.CONFLICT, "DAILY_FOCUS_LIMIT_EXCEEDED", Map.of(
                    "limit", FOCUS_LIMIT
            ));
        }

        String itemId = existing.map(DailyPlanRepository.DailyPlanItemRecord::id)
                .orElseGet(() -> UUID.randomUUID().toString());
        repository.upsertItem(new DailyPlanRepository.DailyPlanItemRecord(
                itemId,
                plan.id(),
                taskId,
                section,
                now + ":" + itemId,
                existing.map(DailyPlanRepository.DailyPlanItemRecord::createdAt).orElse(now)
        ));
        repository.touch(userId, plan.id(), now);
        events.append(userId, taskId, "ADDED_TO_DAILY_PLAN", Map.of(
                "localDate", date.toString(),
                "section", section.name()
        ), now);
        return repository.toView(repository.find(userId, date).orElseThrow());
    }

    @Transactional
    public DailyPlanView remove(
            String userId,
            LocalDate date,
            String taskId,
            String defaultTimeZone
    ) {
        DailyPlanRepository.DailyPlanRecord plan = repository.find(userId, date)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "DAILY_PLAN_NOT_FOUND"));
        if (!repository.removeItem(userId, plan.id(), taskId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "DAILY_PLAN_ITEM_NOT_FOUND");
        }
        OffsetDateTime now = OffsetDateTime.now(clock);
        repository.touch(userId, plan.id(), now);
        events.append(userId, taskId, "REMOVED_FROM_DAILY_PLAN", Map.of(
                "localDate", date.toString()
        ), now);
        return get(userId, date, defaultTimeZone);
    }

    private DailyPlanRepository.DailyPlanRecord createPlan(
            String userId,
            LocalDate date,
            String timeZone,
            OffsetDateTime now
    ) {
        var plan = new DailyPlanRepository.DailyPlanRecord(
                UUID.randomUUID().toString(),
                userId,
                date,
                timeZone,
                now,
                now,
                1
        );
        repository.insert(plan);
        return plan;
    }

    private DailyPlanView empty(String userId, LocalDate date, String timeZone) {
        return new DailyPlanView(
                null,
                userId,
                date,
                timeZone,
                null,
                null,
                0,
                java.util.List.of(),
                java.util.List.of()
        );
    }

    private void validateTimeZone(String timeZone) {
        try {
            ZoneId.of(timeZone);
        } catch (DateTimeException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TIME_ZONE_INVALID");
        }
    }
}
