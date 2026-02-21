import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import { canonicalizeRoleClaim } from "../shared/auth";
import { withControlAuth } from "./withControlAuth";

const db = admin.firestore();
const auth = admin.auth();
const USERS_COLLECTION = "users";
const SEARCH_LIMIT = 20;

type ControlPayload = Record<string, unknown> | null | undefined;

type AdminUserRole = "user" | "moderator" | "superadmin";

type AdminUserSearchResult = {
  uid: string;
  email: string;
  displayName: string;
  role: AdminUserRole;
  status: string;
};

function readPayload(caller: CallableRequest<ControlPayload>): Record<string, unknown> {
  const payload = caller.data;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpsError("invalid-argument", "Callable payload must be an object.");
  }
  return payload as Record<string, unknown>;
}

function normalizeSearchQuery(payload: Record<string, unknown>): string {
  const raw = payload.query;
  if (typeof raw !== "string") {
    throw new HttpsError("invalid-argument", "query must be a string.");
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized.length < 2) {
    throw new HttpsError("invalid-argument", "query must contain at least 2 characters.");
  }
  if (normalized.length > 120) {
    throw new HttpsError("invalid-argument", "query is too long.");
  }

  return normalized;
}

function normalizeProfileStatus(profileData: FirebaseFirestore.DocumentData | undefined): string {
  const rawStatus = profileData?.status;
  if (typeof rawStatus !== "string") return "unknown";
  const normalized = rawStatus.trim().toLowerCase();
  return normalized.length > 0 ? normalized : "unknown";
}

function resolveDisplayName(
  authUser: admin.auth.UserRecord | undefined,
  profileData: FirebaseFirestore.DocumentData | undefined
): string {
  const authName = typeof authUser?.displayName === "string" ? authUser.displayName.trim() : "";
  if (authName.length > 0) return authName;

  const profileDisplayName =
    typeof profileData?.displayName === "string" ? profileData.displayName.trim() : "";
  if (profileDisplayName.length > 0) return profileDisplayName;

  const profileName = typeof profileData?.name === "string" ? profileData.name.trim() : "";
  if (profileName.length > 0) return profileName;

  return "Unknown User";
}

function resolveEmail(
  authUser: admin.auth.UserRecord | undefined,
  profileData: FirebaseFirestore.DocumentData | undefined
): string {
  const authEmail = typeof authUser?.email === "string" ? authUser.email.trim().toLowerCase() : "";
  if (authEmail.length > 0) return authEmail;

  const profileEmail =
    typeof profileData?.email === "string" ? profileData.email.trim().toLowerCase() : "";
  return profileEmail;
}

function resolveRole(authUser: admin.auth.UserRecord | undefined): AdminUserRole {
  return canonicalizeRoleClaim(authUser?.customClaims?.role) as AdminUserRole;
}

function mapResult(
  uid: string,
  authUser: admin.auth.UserRecord | undefined,
  profileData: FirebaseFirestore.DocumentData | undefined
): AdminUserSearchResult {
  return {
    uid,
    email: resolveEmail(authUser, profileData),
    displayName: resolveDisplayName(authUser, profileData),
    role: resolveRole(authUser),
    status: normalizeProfileStatus(profileData),
  };
}

export const searchUsersForAdmin = withControlAuth<
  ControlPayload,
  { users: AdminUserSearchResult[] }
>("moderator", "searchUsersForAdmin", async (caller) => {
  const payload = readPayload(caller);
  const query = normalizeSearchQuery(payload);

  if (query.includes("@")) {
    try {
      const authUser = await auth.getUserByEmail(query);
      const profileSnap = await db.collection(USERS_COLLECTION).doc(authUser.uid).get();
      return {
        users: [mapResult(authUser.uid, authUser, profileSnap.data())],
      };
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        (error as { code?: unknown }).code === "auth/user-not-found"
      ) {
        return { users: [] };
      }
      throw error;
    }
  }

  const usersSnap = await db
    .collection(USERS_COLLECTION)
    .orderBy("displayNameLower")
    .startAt(query)
    .endAt(`${query}\uf8ff`)
    .limit(SEARCH_LIMIT)
    .get();

  if (usersSnap.empty) {
    return { users: [] };
  }

  const docs = usersSnap.docs;
  const uids = docs.map((doc) => doc.id);
  const authLookup = await auth.getUsers(uids.map((uid) => ({ uid })));
  const authByUid = new Map(authLookup.users.map((user) => [user.uid, user] as const));

  const users = docs.map((doc) => mapResult(doc.id, authByUid.get(doc.id), doc.data()));
  return { users };
});
