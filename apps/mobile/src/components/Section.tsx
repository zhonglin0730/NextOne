import type { PropsWithChildren } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/theme";

interface SectionProps extends PropsWithChildren {
  title: string;
  count?: number;
}

export function Section({ title, count, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {count === undefined ? null : <Text style={styles.count}>{count}</Text>}
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
  },
  count: {
    minWidth: 28,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 99,
    overflow: "hidden",
    color: colors.primary,
    backgroundColor: "#dce9df",
    textAlign: "center",
    fontWeight: "700",
  },
  content: {
    gap: spacing.sm,
  },
});
