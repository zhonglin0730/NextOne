export type MobileAppState = "active" | "background" | "inactive" | "unknown";

export interface ConnectivityState {
  isConnected?: boolean;
  isInternetReachable?: boolean;
}

export function isUsableNetwork(state: ConnectivityState): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

export function shouldSyncOnForeground(previous: MobileAppState, current: MobileAppState): boolean {
  return current === "active" && previous !== "active";
}

export function shouldSyncOnNetworkRecovery(
  previous: ConnectivityState,
  current: ConnectivityState,
): boolean {
  return !isUsableNetwork(previous) && isUsableNetwork(current);
}

export async function runSyncWithoutBlockingLocalUse(
  attempt: () => Promise<unknown>,
): Promise<void> {
  try {
    await attempt();
  } catch {
    // Sync is opportunistic. Local writes and navigation remain available.
  }
}
