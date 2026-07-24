export const apiErrorCodes = [
  "TASK_INVALID_TRANSITION",
  "TASK_WIP_LIMIT_REACHED",
  "DAILY_PLAN_LIMIT_REACHED",
  "ENTITY_REVISION_CONFLICT",
  "SYNC_SCHEMA_UNSUPPORTED",
] as const;

export type ApiErrorCode = (typeof apiErrorCodes)[number];

export interface ApiError {
  code: ApiErrorCode;
  params?: Readonly<Record<string, string | number | boolean>>;
  traceId?: string;
}
