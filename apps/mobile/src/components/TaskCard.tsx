import type { Task, TaskStatus } from "@nextone/domain";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useMobile } from "@/appState/MobileProvider";
import { copy } from "@/lib/mobileCopy";
import { taskDecisionsFor } from "@/tasks/taskDecisions";
import { colors, spacing } from "@/theme";

interface TaskCardProps {
  task: Task;
  showAddToday?: boolean;
  onRemoveToday?: () => void;
}

function actionLabel(status: TaskStatus): string {
  return status === "INBOX" ? copy.status.INBOX : copy.action[status];
}

export function TaskCard({ task, showAddToday = false, onRemoveToday }: TaskCardProps) {
  const { addToToday, transition, loading } = useMobile();
  const [decisionOpen, setDecisionOpen] = useState(false);
  const decisions = taskDecisionsFor(task.status);

  const decide = async (status: TaskStatus) => {
    setDecisionOpen(false);
    await transition(task, status);
  };

  return (
    <>
      <Pressable
        accessibilityHint="打开任务决策"
        accessibilityRole="button"
        onPress={() => setDecisionOpen(true)}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      >
        <View style={styles.cardBody}>
          <Text numberOfLines={2} style={styles.title}>
            {task.title}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.status}>{copy.status[task.status]}</Text>
            {task.estimateMinutes === undefined ? null : (
              <Text style={styles.meta}>{task.estimateMinutes} 分钟</Text>
            )}
          </View>
          {task.note === undefined ? null : (
            <Text numberOfLines={2} style={styles.note}>
              {task.note}
            </Text>
          )}
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
      {showAddToday || onRemoveToday !== undefined ? (
        <View style={styles.inlineActions}>
          {showAddToday ? (
            <Pressable
              disabled={loading}
              onPress={() => void addToToday(task)}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>{copy.addToday}</Text>
            </Pressable>
          ) : null}
          {onRemoveToday === undefined ? null : (
            <Pressable disabled={loading} onPress={onRemoveToday} style={styles.textButton}>
              <Text style={styles.textButtonText}>移出今天</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      <Modal
        animationType="slide"
        onRequestClose={() => setDecisionOpen(false)}
        transparent
        visible={decisionOpen}
      >
        <Pressable onPress={() => setDecisionOpen(false)} style={styles.backdrop}>
          <Pressable onPress={() => undefined} style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetEyebrow}>现在怎么处理？</Text>
            <Text style={styles.sheetTitle}>{task.title}</Text>
            <Text style={styles.sheetHint}>选择会立即保存在本机，离线时也不会丢失。</Text>
            <View style={styles.decisionList}>
              {decisions.map((status, index) => (
                <Pressable
                  disabled={loading}
                  key={status}
                  onPress={() => void decide(status)}
                  style={[
                    styles.decisionButton,
                    index === 0 && styles.primaryDecision,
                    status === "CANCELED" && styles.dangerDecision,
                  ]}
                >
                  <Text
                    style={[
                      styles.decisionText,
                      index === 0 && styles.primaryDecisionText,
                      status === "CANCELED" && styles.dangerDecisionText,
                    ]}
                  >
                    {actionLabel(status)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setDecisionOpen(false)} style={styles.cancelButton}>
              <Text style={styles.cancelText}>{copy.cancel}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 86,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 17,
    backgroundColor: colors.surface,
  },
  cardPressed: {
    backgroundColor: "#f0ede4",
  },
  cardBody: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  },
  note: {
    color: colors.muted,
    lineHeight: 19,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  status: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
  },
  chevron: {
    color: colors.muted,
    fontSize: 28,
  },
  inlineActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: -4,
    marginBottom: spacing.xs,
  },
  secondaryButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#dce9df",
  },
  secondaryButtonText: {
    color: colors.primary,
    fontWeight: "700",
  },
  textButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  textButtonText: {
    color: colors.muted,
    fontWeight: "600",
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(17, 28, 22, 0.45)",
  },
  sheet: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 36,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.surface,
  },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    marginBottom: spacing.lg,
    borderRadius: 99,
    backgroundColor: colors.border,
  },
  sheetEyebrow: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  sheetTitle: {
    marginTop: spacing.xs,
    color: colors.ink,
    fontSize: 22,
    lineHeight: 29,
    fontWeight: "800",
  },
  sheetHint: {
    marginTop: spacing.sm,
    color: colors.muted,
    lineHeight: 20,
  },
  decisionList: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  decisionButton: {
    alignItems: "center",
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
  },
  primaryDecision: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  dangerDecision: {
    borderColor: "#e5c4c4",
  },
  decisionText: {
    color: colors.ink,
    fontWeight: "700",
  },
  primaryDecisionText: {
    color: "#ffffff",
  },
  dangerDecisionText: {
    color: colors.danger,
  },
  cancelButton: {
    alignItems: "center",
    marginTop: spacing.sm,
    padding: 14,
  },
  cancelText: {
    color: colors.muted,
    fontWeight: "700",
  },
});
