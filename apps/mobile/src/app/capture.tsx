import { useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useMobile } from "@/appState/MobileProvider";
import { copy } from "@/lib/mobileCopy";
import { colors, spacing } from "@/theme";

export default function CapturePage() {
  const router = useRouter();
  const { capture, loading } = useMobile();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");

  const submit = async () => {
    if (title.trim().length === 0) return;
    try {
      await capture(title, note);
      router.back();
    } catch {
      // The provider shows the error and keeps the capture form open.
    }
  };

  return (
    <SafeAreaView edges={["bottom"]} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <View style={styles.offlineNote}>
          <Text style={styles.offlineMark}>●</Text>
          <Text style={styles.offlineText}>先保存在本机，离线也可以继续</Text>
        </View>
        <TextInput
          accessibilityLabel="任务标题"
          autoFocus
          maxLength={240}
          multiline
          onChangeText={setTitle}
          placeholder={copy.capturePlaceholder}
          placeholderTextColor={colors.muted}
          returnKeyType="next"
          style={styles.titleInput}
          value={title}
        />
        <Text style={styles.label}>{copy.captureNote}</Text>
        <TextInput
          accessibilityLabel={copy.captureNote}
          maxLength={4000}
          multiline
          onChangeText={setNote}
          placeholder={copy.captureNotePlaceholder}
          placeholderTextColor={colors.muted}
          style={styles.noteInput}
          textAlignVertical="top"
          value={note}
        />
        <Pressable
          disabled={loading || title.trim().length === 0}
          onPress={() => void submit()}
          style={({ pressed }) => [
            styles.submit,
            (loading || title.trim().length === 0) && styles.submitDisabled,
            pressed && styles.submitPressed,
          ]}
        >
          <Text style={styles.submitText}>{loading ? copy.saving : copy.captureSubmit}</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  offlineNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  offlineMark: {
    color: colors.success,
    fontSize: 10,
  },
  offlineText: {
    color: colors.muted,
    fontSize: 13,
  },
  titleInput: {
    minHeight: 120,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    color: colors.ink,
    backgroundColor: colors.surface,
    fontSize: 23,
    lineHeight: 31,
    fontWeight: "700",
    textAlignVertical: "top",
  },
  label: {
    color: colors.ink,
    fontWeight: "700",
  },
  noteInput: {
    minHeight: 150,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    color: colors.ink,
    backgroundColor: colors.surface,
    fontSize: 16,
    lineHeight: 23,
  },
  submit: {
    alignItems: "center",
    marginTop: "auto",
    padding: spacing.md,
    borderRadius: 15,
    backgroundColor: colors.primary,
  },
  submitDisabled: {
    opacity: 0.45,
  },
  submitPressed: {
    backgroundColor: colors.primaryPressed,
  },
  submitText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
});
