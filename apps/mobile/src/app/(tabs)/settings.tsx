import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useMobile } from "@/appState/MobileProvider";
import { Screen } from "@/components/Screen";
import { colors, spacing } from "@/theme";

export default function SettingsPage() {
  const { credentials, saveCredentials, sync, syncNow, loading, refresh } = useMobile();
  const [apiUrl, setApiUrl] = useState("");
  const [token, setToken] = useState("");
  const [deviceId, setDeviceId] = useState("");

  useEffect(() => {
    void credentials().then((value) => {
      setApiUrl(value.apiUrl);
      setToken(value.token);
      setDeviceId(value.deviceId);
    });
  }, [credentials]);

  const save = async () => {
    try {
      await saveCredentials({ apiUrl, token, deviceId });
      Alert.alert("已保存", "凭据已写入系统安全存储。");
    } catch (cause) {
      Alert.alert("保存失败", cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <Screen
      description="服务器只负责多端同步；本机数据和操作不依赖网络。"
      loading={loading}
      onRefresh={refresh}
      title="同步与安全"
    >
      <View style={styles.statusCard}>
        <View>
          <Text style={styles.eyebrow}>当前状态</Text>
          <Text style={styles.status}>{sync?.state.status ?? "OFFLINE"}</Text>
        </View>
        <View style={styles.counts}>
          <Text style={styles.countText}>待同步 {sync?.pendingCount ?? 0}</Text>
          <Text style={styles.countText}>冲突 {sync?.conflictCount ?? 0}</Text>
        </View>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>服务器连接</Text>
        <Text style={styles.help}>
          Android 模拟器访问本机服务用 10.0.2.2；真机请填写电脑或 Oracle 服务器可访问的 HTTPS 地址。
        </Text>
        <Text style={styles.label}>API 地址</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onChangeText={setApiUrl}
          placeholder="https://nextone.example.com"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={apiUrl}
        />
        <Text style={styles.label}>访问令牌</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setToken}
          secureTextEntry
          style={styles.input}
          value={token}
        />
        <Text style={styles.device}>设备 ID：{deviceId || "生成中…"}</Text>
        <Pressable disabled={loading} onPress={() => void save()} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>安全保存</Text>
        </Pressable>
      </View>

      <Pressable disabled={loading} onPress={() => void syncNow()} style={styles.syncButton}>
        <Text style={styles.syncButtonText}>立即同步</Text>
      </Pressable>
      {sync?.state.lastError === undefined ? null : (
        <Text style={styles.error}>
          最近一次同步失败：{sync.state.lastError}。本地功能不受影响，网络恢复后会重试。
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.md,
    borderRadius: 18,
    backgroundColor: colors.ink,
  },
  eyebrow: {
    color: "#b9c9bf",
    fontSize: 12,
    fontWeight: "700",
  },
  status: {
    marginTop: spacing.xs,
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "800",
  },
  counts: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: spacing.xs,
  },
  countText: {
    color: "#e2e9e4",
    fontSize: 13,
  },
  formCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800",
  },
  help: {
    color: colors.muted,
    lineHeight: 20,
  },
  label: {
    marginTop: spacing.xs,
    color: colors.ink,
    fontWeight: "700",
  },
  input: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.ink,
    backgroundColor: "#ffffff",
  },
  device: {
    color: colors.muted,
    fontSize: 12,
  },
  primaryButton: {
    alignItems: "center",
    marginTop: spacing.sm,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "800",
  },
  syncButton: {
    alignItems: "center",
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 14,
  },
  syncButtonText: {
    color: colors.primary,
    fontWeight: "800",
  },
  error: {
    padding: spacing.md,
    borderRadius: 12,
    color: colors.waiting,
    backgroundColor: "#f4e2d1",
    lineHeight: 20,
  },
});
