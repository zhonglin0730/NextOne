import * as Network from "expo-network";
import { AppState, type AppStateStatus } from "react-native";

import {
  runSyncWithoutBlockingLocalUse,
  shouldSyncOnForeground,
  shouldSyncOnNetworkRecovery,
  type ConnectivityState,
  type MobileAppState,
} from "./syncTriggerPolicy";

function asMobileAppState(state: AppStateStatus): MobileAppState {
  return state === "active" || state === "background" || state === "inactive" ? state : "unknown";
}

export function startAutomaticSync(syncNow: () => Promise<unknown>): () => void {
  let appState = asMobileAppState(AppState.currentState);
  let connectivity: ConnectivityState = {};
  const attempt = () => runSyncWithoutBlockingLocalUse(syncNow);

  void attempt();

  const appStateSubscription = AppState.addEventListener("change", (nextState) => {
    const next = asMobileAppState(nextState);
    if (shouldSyncOnForeground(appState, next)) void attempt();
    appState = next;
  });
  const networkSubscription = Network.addNetworkStateListener((nextState) => {
    if (shouldSyncOnNetworkRecovery(connectivity, nextState)) void attempt();
    connectivity = nextState;
  });

  return () => {
    appStateSubscription.remove();
    networkSubscription.remove();
  };
}
