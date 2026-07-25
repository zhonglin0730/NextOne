package com.nextone.review;

import com.nextone.project.ProjectView;
import com.nextone.task.TaskView;
import java.util.List;
import java.util.Map;

public record ReviewQueueView(
        List<ReviewTask> tasks,
        List<ProjectView> focuslessProjects,
        Map<String, Long> counts
) {
    public record ReviewTask(TaskView task, List<String> reasons) {
    }
}
