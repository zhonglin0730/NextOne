import { StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/theme";

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.mark}>✓</Text>
      <Text style={styles.title}>{title}</Text>
      {detail === undefined ? null : <Text style={styles.detail}>{detail}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  mark: {
    color: colors.primary,
    fontSize: 24,
    fontWeight: "800",
  },
  title: {
    color: colors.ink,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
  },
  detail: {
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
});
