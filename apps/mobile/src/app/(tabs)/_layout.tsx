import { Link, Tabs } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";

import { copy } from "@/lib/mobileCopy";
import { colors } from "@/theme";

function CaptureButton() {
  return (
    <Link asChild href="/capture">
      <Pressable accessibilityLabel={copy.capture} style={styles.captureButton}>
        <Text style={styles.captureIcon}>＋</Text>
      </Pressable>
    </Link>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerRight: () => <CaptureButton />,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.ink, fontWeight: "800" },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          height: 68,
          paddingTop: 7,
          paddingBottom: 9,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
        },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: copy.today,
          tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>●</Text>,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: copy.inbox,
          tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>▣</Text>,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: copy.settings,
          tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>⚙</Text>,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  captureButton: {
    width: 38,
    height: 38,
    marginRight: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    backgroundColor: colors.primary,
  },
  captureIcon: {
    marginTop: -2,
    color: "#ffffff",
    fontSize: 25,
    lineHeight: 28,
  },
  tabIcon: {
    fontSize: 17,
  },
});
