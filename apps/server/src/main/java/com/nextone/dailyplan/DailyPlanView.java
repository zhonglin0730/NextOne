package com.nextone.dailyplan;

import com.nextone.task.TaskView;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

public record DailyPlanView(
        String id,
        String userId,
        LocalDate localDate,
        String timeZone,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        long revision,
        List<DailyPlanTask> focus,
        List<DailyPlanTask> later
) {
    public record DailyPlanTask(
            String itemId,
            DailyPlanSection section,
            String sortKey,
            OffsetDateTime selectedAt,
            TaskView task
    ) {
    }
}
