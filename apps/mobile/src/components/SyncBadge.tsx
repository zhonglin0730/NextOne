import { StyleSheet, Text, View } from "react-native";

import { useMobile } from "@/appState/MobileProvider";
import { colors, spacing } from "@/theme";

export function SyncBadge() {
  const { sync } = useMobile();
  const status = sync?.state.status ?? "OFFLINE";
  const labels = {
    OFFLINE: "离线可用",
    SYNCING: "同步中",
    UP_TO_DATE: "已同步",
    ERROR: "待重试",
  } as const;
  return (
    <View style={[styles.badge, status === "ERROR" && styles.badgeError]}>
      <View style={[styles.dot, status === "ERROR" && styles.dotError]} />
      <Text style={styles.text}>{labels[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 99,
    backgroundColor: "#dce9df",
  },
  badgeError: {
    backgroundColor: "#f4e2d1",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 99,
    backgroundColor: colors.success,
  },
  dotError: {
    backgroundColor: colors.waiting,
  },
  text: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
  },
});
