import { ActivityIndicator } from "react-native";

import { useMobile } from "@/appState/MobileProvider";
import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";
import { Section } from "@/components/Section";
import { SyncBadge } from "@/components/SyncBadge";
import { TaskCard } from "@/components/TaskCard";
import { copy } from "@/lib/mobileCopy";
import { colors } from "@/theme";

export default function TodayPage() {
  const { planned, doing, ready, loading, readyToUse, refresh, removeFromToday } = useMobile();

  if (!readyToUse && loading) {
    return (
      <Screen title={copy.todayTitle}>
        <ActivityIndicator color={colors.primary} size="large" />
      </Screen>
    );
  }

  const plannedIds = new Set(planned.map((task) => task.id));
  const commitments = planned;
  const candidates = [...doing, ...ready]
    .filter((task) => !plannedIds.has(task.id))
    .slice(0, 5);

  return (
    <Screen
      description={copy.todayDescription}
      headerAccessory={<SyncBadge />}
      loading={loading}
      onRefresh={refresh}
      title={copy.todayTitle}
    >
      <Section count={commitments.length} title={copy.commitments}>
        {commitments.length === 0 ? (
          <EmptyState detail="从下方候选中选一件真正值得承诺的事。" title={copy.emptyFocus} />
        ) : (
          commitments.map((task) => (
            <TaskCard
              key={task.id}
              {...(plannedIds.has(task.id)
                ? { onRemoveToday: () => void removeFromToday(task) }
                : {})}
              task={task}
            />
          ))
        )}
      </Section>

      {candidates.length === 0 ? null : (
        <Section count={candidates.length} title="可以加入今天">
          {candidates.map((task) => (
            <TaskCard key={task.id} showAddToday task={task} />
          ))}
        </Section>
      )}
    </Screen>
  );
}
