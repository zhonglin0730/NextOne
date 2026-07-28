export const tasksChangedEvent = "nextone:tasks-changed";
export const localMutationsPendingEvent = "nextone:local-mutations-pending";

export function announceLocalDataChanged(target: EventTarget = window): void {
  target.dispatchEvent(new Event(tasksChangedEvent));
  target.dispatchEvent(new Event(localMutationsPendingEvent));
}

export function announceSyncedDataChanged(target: EventTarget = window): void {
  target.dispatchEvent(new Event(tasksChangedEvent));
}
