import { HttpsError } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";
import { canonicalizeRoleClaim } from "../shared/auth";

export type UserRole = "user" | "moderator" | "superadmin";

const ROLE_LEVEL: Record<UserRole, number> = {
  user: 0,
  moderator: 1,
  superadmin: 2,
};

export function assertRoleAtLeast(
  caller: CallableRequest<unknown>,
  minimum: UserRole
): { uid: string; role: UserRole } {
  if (!caller.auth || typeof caller.auth.uid !== "string" || caller.auth.uid.trim().length === 0) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const role = canonicalizeRoleClaim(caller.auth.token?.role) as UserRole;
  if (ROLE_LEVEL[role] < ROLE_LEVEL[minimum]) {
    throw new HttpsError("permission-denied", `Requires role: ${minimum}`);
  }

  return { uid: caller.auth.uid.trim(), role };
}

