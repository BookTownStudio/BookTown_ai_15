import { HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";

export type CanonicalRole = "user" | "moderator" | "superadmin";

const ROLE_WEIGHT: Record<CanonicalRole, number> = {
  user: 0,
  moderator: 1,
  superadmin: 2,
};

const ROLE_ALIASES: Record<string, CanonicalRole> = {
  user: "user",
  moderator: "moderator",
  superadmin: "superadmin",
  superuser: "moderator",
  admin: "superadmin",
  system: "superadmin",
};

type CallableAuth =
  | {
      uid: string;
      token?: Record<string, unknown>;
    }
  | null
  | undefined;

export function canonicalizeRoleClaim(rawRole: unknown): CanonicalRole {
  if (typeof rawRole !== "string") return "user";
  const normalized = rawRole.trim().toLowerCase();
  return ROLE_ALIASES[normalized] ?? "user";
}

export function assertAuthenticated(auth: CallableAuth): {
  uid: string;
  token: Record<string, unknown>;
} {
  if (!auth || typeof auth.uid !== "string" || auth.uid.trim().length === 0) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  return {
    uid: auth.uid.trim(),
    token:
      auth.token && typeof auth.token === "object"
        ? (auth.token as Record<string, unknown>)
        : {},
  };
}

export function getRoleFromClaims(auth: CallableAuth): CanonicalRole {
  const { token } = assertAuthenticated(auth);
  return canonicalizeRoleClaim(token.role);
}

export function assertRoleFromClaims(
  auth: CallableAuth,
  requiredRole: CanonicalRole | CanonicalRole[]
): { uid: string; role: CanonicalRole } {
  const { uid, token } = assertAuthenticated(auth);
  const callerRole = canonicalizeRoleClaim(token.role);
  const required = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  const allowed = required.some(
    (role) => ROLE_WEIGHT[callerRole] >= ROLE_WEIGHT[role]
  );

  if (!allowed) {
    throw new HttpsError("permission-denied", "Insufficient role permissions.");
  }

  return { uid, role: callerRole };
}

export async function assertActiveUser(uid: string): Promise<void> {
  const normalizedUid = uid.trim();
  if (!normalizedUid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const userSnap = await admin.firestore().doc(`users/${normalizedUid}`).get();
  if (!userSnap.exists) {
    throw new HttpsError("permission-denied", "User profile is missing.");
  }

  const user = (userSnap.data() ?? {}) as Record<string, unknown>;
  const status = typeof user.status === "string" ? user.status.toLowerCase() : "";
  const isSuspended = user.isSuspended === true || status === "suspended";

  if (isSuspended) {
    throw new HttpsError(
      "failed-precondition",
      "Account is suspended from mutating operations."
    );
  }
}

export async function assertActiveAuthenticatedUser(
  auth: CallableAuth
): Promise<{ uid: string; token: Record<string, unknown> }> {
  const caller = assertAuthenticated(auth);
  await assertActiveUser(caller.uid);
  return caller;
}
