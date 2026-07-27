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
  const { focus, doing, later, ready, loading, readyToUse, refresh, removeFromToday } = useMobile();

  if (!readyToUse && loading) {
    return (
      <Screen title={copy.todayTitle}>
        <ActivityIndicator color={colors.primary} size="large" />
      </Screen>
    );
  }

  const plannedIds = new Set([...focus, ...later, ...doing].map((task) => task.id));
  const candidates = ready.filter((task) => !plannedIds.has(task.id)).slice(0, 5);

  return (
    <Screen
      description={copy.todayDescription}
      headerAccessory={<SyncBadge />}
      loading={loading}
      onRefresh={refresh}
      title={copy.todayTitle}
    >
      <Section count={focus.length} title={copy.focus}>
        {focus.length === 0 ? (
          <EmptyState detail="从下方候选中选一件真正值得承诺的事。" title={copy.emptyFocus} />
        ) : (
          focus.map((task) => (
            <TaskCard key={task.id} onRemoveToday={() => void removeFromToday(task)} task={task} />
          ))
        )}
      </Section>

      <Section count={doing.length} title={copy.doing}>
        {doing.length === 0 ? (
          <EmptyState title={copy.emptyDoing} />
        ) : (
          doing.map((task) => <TaskCard key={task.id} task={task} />)
        )}
      </Section>

      <Section count={later.length} title={copy.later}>
        {later.length === 0 ? (
          <EmptyState title={copy.emptyLater} />
        ) : (
          later.map((task) => (
            <TaskCard key={task.id} onRemoveToday={() => void removeFromToday(task)} task={task} />
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
