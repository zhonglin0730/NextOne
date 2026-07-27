import { TaskApplicationService, WipLimitExceededError } from "@nextone/application";
import type { Task, TaskStatus } from "@nextone/domain";
import type { SyncSummary } from "@nextone/sync-core";
import { randomUUID } from "expo-crypto";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { Alert } from "react-native";

import { currentLocalDate, currentTimeZone } from "@/lib/date";
import { mobileDatabase } from "@/storage/sqliteDatabase";
import { startAutomaticSync } from "@/sync/automaticSync";
import type { MobileSyncCredentials } from "@/sync/credentials";
import { MobileSyncService } from "@/sync/syncService";

interface MobileData {
  inbox: readonly Task[];
  focus: readonly Task[];
  later: readonly Task[];
  doing: readonly Task[];
  ready: readonly Task[];
}

interface MobileContextValue extends MobileData {
  readyToUse: boolean;
  loading: boolean;
  error?: string;
  sync?: SyncSummary;
  refresh(): Promise<void>;
  capture(title: string, note?: string): Promise<void>;
  transition(task: Task, status: TaskStatus): Promise<void>;
  addToToday(task: Task): Promise<void>;
  removeFromToday(task: Task): Promise<void>;
  syncNow(): Promise<void>;
  credentials(): Promise<MobileSyncCredentials>;
  saveCredentials(credentials: MobileSyncCredentials): Promise<void>;
}

const emptyData: MobileData = {
  inbox: [],
  focus: [],
  later: [],
  doing: [],
  ready: [],
};

const MobileContext = createContext<MobileContextValue | undefined>(undefined);
const taskService = new TaskApplicationService({
  database: mobileDatabase,
  userId: "local-user",
  generateId: randomUUID,
  now: () => new Date().toISOString(),
});
const syncService = new MobileSyncService(mobileDatabase);

export function MobileProvider({ children }: PropsWithChildren) {
  const [data, setData] = useState<MobileData>(emptyData);
  const [sync, setSync] = useState<SyncSummary>();
  const [readyToUse, setReadyToUse] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      const inbox = await taskService.listInbox();
      const today = await taskService.getToday(currentLocalDate());
      const board = await taskService.listBoardTasks();
      const summary = await syncService.summary();
      setData({
        inbox,
        focus: today.focus.map(({ task }) => task),
        later: today.later.map(({ task }) => task),
        doing: today.doing,
        ready: board.filter((task) => task.status === "READY"),
      });
      setSync(summary);
      setError(undefined);
      setReadyToUse(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let stopAutomaticSync: () => void = () => undefined;
    void refresh().then(() => {
      if (!active) return;
      stopAutomaticSync = startAutomaticSync(async () => {
        await syncService.syncNow();
        await refresh();
      });
    });
    const unsubscribe = syncService.subscribe(() => {
      void syncService.summary().then(setSync);
    });
    return () => {
      active = false;
      stopAutomaticSync();
      unsubscribe();
    };
  }, [refresh]);

  const runLocalAction = useCallback(
    async (action: () => Promise<unknown>) => {
      setLoading(true);
      try {
        await action();
        await refresh();
        void syncService.syncNow().then(refresh);
      } catch (cause) {
        if (cause instanceof WipLimitExceededError) {
          Alert.alert(
            "进行中任务已达上限",
            `当前已有 ${cause.activeCount} 项进行中。先完成或等待一项，再开始新的任务。`,
          );
        } else {
          const message = cause instanceof Error ? cause.message : String(cause);
          setError(message);
          Alert.alert("操作未完成", message);
        }
      } finally {
        setLoading(false);
      }
    },
    [refresh],
  );

  const getCredentials = useCallback(() => syncService.credentials(), []);
  const updateCredentials = useCallback(
    async (credentials: MobileSyncCredentials) => {
      await syncService.saveCredentials(credentials);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<MobileContextValue>(
    () => ({
      ...data,
      readyToUse,
      loading,
      ...(error === undefined ? {} : { error }),
      ...(sync === undefined ? {} : { sync }),
      refresh,
      capture: async (title, note) => {
        setLoading(true);
        try {
          await taskService.capture({
            title,
            ...(note === undefined || note.trim().length === 0 ? {} : { note }),
          });
          await refresh();
          void syncService.syncNow().then(refresh);
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause);
          setError(message);
          Alert.alert("记录失败", message);
          throw cause;
        } finally {
          setLoading(false);
        }
      },
      transition: (task, status) => runLocalAction(() => taskService.transition(task.id, status)),
      addToToday: (task) =>
        runLocalAction(() =>
          taskService.addToToday(task.id, currentLocalDate(), currentTimeZone()),
        ),
      removeFromToday: (task) =>
        runLocalAction(() => taskService.removeFromToday(task.id, currentLocalDate())),
      syncNow: async () => {
        setLoading(true);
        try {
          setSync(await syncService.syncNow());
          await refresh();
        } finally {
          setLoading(false);
        }
      },
      credentials: getCredentials,
      saveCredentials: updateCredentials,
    }),
    [
      data,
      error,
      getCredentials,
      loading,
      readyToUse,
      refresh,
      runLocalAction,
      sync,
      updateCredentials,
    ],
  );

  return <MobileContext.Provider value={value}>{children}</MobileContext.Provider>;
}

export function useMobile(): MobileContextValue {
  const context = useContext(MobileContext);
  if (context === undefined) {
    throw new Error("useMobile must be used within MobileProvider");
  }
  return context;
}
