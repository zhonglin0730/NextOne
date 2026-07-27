import { Link } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";

import { useMobile } from "@/appState/MobileProvider";
import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";
import { SyncBadge } from "@/components/SyncBadge";
import { TaskCard } from "@/components/TaskCard";
import { copy } from "@/lib/mobileCopy";
import { colors, spacing } from "@/theme";

export default function InboxPage() {
  const { inbox, loading, refresh } = useMobile();

  return (
    <Screen
      description={copy.inboxDescription}
      headerAccessory={<SyncBadge />}
      loading={loading}
      onRefresh={refresh}
      title={copy.inboxTitle}
    >
      {inbox.length === 0 ? (
        <>
          <EmptyState
            detail="新想法先记录，不必立刻安排；整理时再做决定。"
            title={copy.inboxEmpty}
          />
          <Link asChild href="/capture">
            <Pressable style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{copy.capture}</Text>
            </Pressable>
          </Link>
        </>
      ) : (
        inbox.map((task) => <TaskCard key={task.id} task={task} />)
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  primaryButton: {
    alignItems: "center",
    padding: spacing.md,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "800",
  },
});
