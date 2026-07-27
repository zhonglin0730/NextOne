import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { MobileProvider } from "@/appState/MobileProvider";
import { colors } from "@/theme";

export default function RootLayout() {
  return (
    <MobileProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.ink,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="capture"
          options={{
            presentation: "modal",
            title: "快速记录",
          }}
        />
      </Stack>
    </MobileProvider>
  );
}
