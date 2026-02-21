import {
  onCall,
  type CallableFunction,
  type CallableRequest,
} from "firebase-functions/v2/https";
import { assertRoleAtLeast, type UserRole } from "./assertRole";
import { logAdminAction } from "./auditLogger";

type ControlMinimumRole = Exclude<UserRole, "user">;

type CallablePayload = Record<string, unknown> | null | undefined;

function readStringField(
  payload: CallablePayload,
  key: string,
  fallback: string
): string {
  if (!payload || typeof payload !== "object") return fallback;
  const raw = payload[key];
  if (typeof raw !== "string") return fallback;
  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : fallback;
}

export function withControlAuth<TData extends CallablePayload, TResult>(
  minimumRole: ControlMinimumRole,
  actionType: string,
  handler: (caller: CallableRequest<TData>) => Promise<TResult>
): CallableFunction<TData, Promise<TResult>> {
  return onCall(async (caller: CallableRequest<TData>) => {
    const { uid, role } = assertRoleAtLeast(caller, minimumRole);

    const result = await handler(caller);

    await logAdminAction({
      actorUid: uid,
      actorRole: role,
      actionType,
      targetType: readStringField(caller.data, "targetType", "unknown"),
      targetId: readStringField(caller.data, "targetId", "unknown"),
      payloadSnapshot: caller.data,
    });

    return result;
  });
}
