import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import {
  assertActiveAuthenticatedUser,
  assertRoleFromClaims,
} from "../shared/auth";

const SPACE_SCHEMA_VERSION = 1;
const BOOKTOWN_CANONICAL_OWNER_ID = "booktown";

type SpaceType = "venue" | "event";
type VenueSubtype =
  | "bookstore"
  | "library"
  | "reading_cafe"
  | "community_space"
  | "cultural_center"
  | "university_space"
  | "publisher"
  | "archive"
  | "other";
type EventSubtype =
  | "reading_session"
  | "author_signing"
  | "book_club"
  | "launch"
  | "workshop"
  | "lecture"
  | "discussion"
  | "festival_session"
  | "exhibition"
  | "online_session"
  | "other";

const VENUE_SUBTYPES = new Set<VenueSubtype>([
  "bookstore",
  "library",
  "reading_cafe",
  "community_space",
  "cultural_center",
  "university_space",
  "publisher",
  "archive",
  "other",
]);

const EVENT_SUBTYPES = new Set<EventSubtype>([
  "reading_session",
  "author_signing",
  "book_club",
  "launch",
  "workshop",
  "lecture",
  "discussion",
  "festival_session",
  "exhibition",
  "online_session",
  "other",
]);

const db = admin.firestore();

function requireString(value: unknown, fieldName: string, maxLength = 240): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${fieldName} is required.`);
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > maxLength) {
    throw new HttpsError("invalid-argument", `${fieldName} is invalid.`);
  }
  return normalized;
}

function optionalString(value: unknown, maxLength = 240): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized && normalized.length <= maxLength ? normalized : undefined;
}

function requireHttpsUrl(value: unknown, fieldName: string): string {
  const url = requireString(value, fieldName, 2048);
  if (!/^https:\/\/[^\s]+$/i.test(url)) {
    throw new HttpsError("invalid-argument", `${fieldName} must be an HTTPS URL.`);
  }
  return url;
}

function normalizeSpaceType(value: unknown): SpaceType {
  if (value === "venue" || value === "event") return value;
  throw new HttpsError("invalid-argument", "spaceType must be venue or event.");
}

function normalizeSubtype(spaceType: SpaceType, value: unknown): VenueSubtype | EventSubtype {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (spaceType === "venue" && VENUE_SUBTYPES.has(normalized as VenueSubtype)) {
    return normalized as VenueSubtype;
  }
  if (spaceType === "event" && EVENT_SUBTYPES.has(normalized as EventSubtype)) {
    return normalized as EventSubtype;
  }
  throw new HttpsError("invalid-argument", "spaceSubtype is not canonical.");
}

function normalizeIdentityBase(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "space";
}

function createIdentity(spaceType: SpaceType, spaceId: string, displayName: string) {
  const suffix = spaceId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toLowerCase() || "space";
  const slug = `${normalizeIdentityBase(displayName)}-${suffix}`;
  return {
    canonicalId: `${spaceType}_${spaceId}`,
    slug,
    displayName,
    normalizedName: displayName.toLowerCase(),
    routePath: `/spaces/${slug}`,
    schemaVersion: SPACE_SCHEMA_VERSION,
  };
}

function createSystemProvenance(callerUid: string) {
  return {
    source: "system_seeded",
    canonicalAuthority: "system",
    schemaVersion: SPACE_SCHEMA_VERSION,
    createdByUid: callerUid,
  };
}

function buildAuthorityProfile(params: {
  managedByUid?: string;
  institutionId?: string;
  callerUid: string;
}) {
  return {
    claimState: params.institutionId
      ? "institutional"
      : params.managedByUid
        ? "claimed"
        : "unclaimed",
    stewardshipState: params.institutionId ? "institutional" : "system_seeded",
    ...(params.managedByUid ? { claimedByUid: params.managedByUid } : {}),
    ...(params.institutionId ? { institutionId: params.institutionId } : {}),
    seededBy: "booktown",
    schemaVersion: SPACE_SCHEMA_VERSION,
  };
}

function buildStewardship(params: {
  callerUid: string;
  managedByUid?: string;
  institutionId?: string;
}) {
  return {
    canonicalOwnerId: BOOKTOWN_CANONICAL_OWNER_ID,
    createdByUid: params.callerUid,
    ...(params.managedByUid ? { managedByUid: params.managedByUid } : {}),
    adminUids: [],
    ...(params.managedByUid ? { assignedByUid: params.callerUid } : {}),
    ...(params.institutionId ? { institutionId: params.institutionId } : {}),
    schemaVersion: SPACE_SCHEMA_VERSION,
  };
}

function buildManagedBy(params: {
  managedByUid?: string;
  callerUid: string;
  institutionId?: string;
}) {
  return {
    ...(params.managedByUid ? { primaryUid: params.managedByUid } : {}),
    adminUids: [],
    ...(params.managedByUid ? { assignedByUid: params.callerUid } : {}),
    ...(params.institutionId ? { institutionId: params.institutionId } : {}),
    schemaVersion: SPACE_SCHEMA_VERSION,
  };
}

function buildCommunication(spaceId: string, ownerUid: string, adminUids: string[] = []) {
  return {
    inboxKind: "space",
    inboxId: `space_${spaceId}`,
    inboxStatus: "disabled",
    ownerUid,
    adminUids,
    participantModel: "space_admins_only",
    schemaVersion: SPACE_SCHEMA_VERSION,
  };
}

function buildRelationshipVisibility() {
  return {
    venue: "public",
    organization: "public",
    books: "private",
    authors: "private",
    series: "private",
    schemaVersion: SPACE_SCHEMA_VERSION,
  };
}

function buildPublicationLifecycle() {
  return {
    state: "published",
    draftMode: "none",
    schemaVersion: SPACE_SCHEMA_VERSION,
  };
}

function eventStateFor(dateTime: string): "scheduled" | "completed" {
  const time = new Date(dateTime).getTime();
  return Number.isFinite(time) && time < Date.now() ? "completed" : "scheduled";
}

function serializeSpaceDoc(doc: admin.firestore.QueryDocumentSnapshot): Record<string, unknown> {
  const data = doc.data();
  const isEvent = data.spaceType === "event" || typeof data.dateTime === "string";
  const displayName =
    typeof data.name === "string"
      ? data.name
      : typeof data.titleEn === "string"
        ? data.titleEn
        : doc.id;
  return {
    id: doc.id,
    spaceType: isEvent ? "event" : "venue",
    displayName,
    spaceSubtype: data.spaceSubtype || data.type || "other",
    governanceStatus: data.governanceStatus || "published",
    claimState: data.authorityProfile?.claimState || "unclaimed",
    stewardshipState: data.authorityProfile?.stewardshipState || "community_created",
    managedByUid: data.stewardship?.managedByUid || data.managedBy?.primaryUid || null,
    routePath: data.identity?.routePath || null,
  };
}

export const adminSearchSpaces = onCall({ cors: true }, async (request) => {
  await assertActiveAuthenticatedUser(request.auth);
  assertRoleFromClaims(request.auth, "moderator");

  const queryText = requireString((request.data as { query?: unknown })?.query, "query", 120)
    .toLowerCase();
  const limit =
    typeof (request.data as { limit?: unknown })?.limit === "number"
      ? Math.min(Math.max(Math.floor((request.data as { limit: number }).limit), 1), 25)
      : 12;

  const [venueSnap, eventSnap] = await Promise.all([
    db
      .collection("venues")
      .where("nameLower", ">=", queryText)
      .where("nameLower", "<=", `${queryText}\uf8ff`)
      .orderBy("nameLower")
      .limit(limit)
      .get(),
    db
      .collection("events")
      .where("titleLower", ">=", queryText)
      .where("titleLower", "<=", `${queryText}\uf8ff`)
      .orderBy("titleLower")
      .limit(limit)
      .get(),
  ]);

  return {
    spaces: [...venueSnap.docs, ...eventSnap.docs].slice(0, limit).map(serializeSpaceDoc),
  };
});

export const adminSeedSpace = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  assertRoleFromClaims(request.auth, "moderator");

  const data = request.data as Record<string, unknown>;
  const spaceType = normalizeSpaceType(data.spaceType);
  const spaceSubtype = normalizeSubtype(spaceType, data.spaceSubtype);
  const displayName = requireString(data.displayName, "displayName", 160);
  const imageUrl = requireHttpsUrl(data.imageUrl, "imageUrl");
  const managedByUid = optionalString(data.managedByUid, 128);
  const institutionId = optionalString(data.institutionId, 128);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const collectionName = spaceType === "event" ? "events" : "venues";
  const ref = db.collection(collectionName).doc();
  const ownerUid = managedByUid || caller.uid;
  const identity = createIdentity(spaceType, ref.id, displayName);
  const authorityProfile = buildAuthorityProfile({ managedByUid, institutionId, callerUid: caller.uid });
  const stewardship = buildStewardship({ callerUid: caller.uid, managedByUid, institutionId });
  const managedBy = buildManagedBy({ callerUid: caller.uid, managedByUid, institutionId });
  const communication = buildCommunication(ref.id, ownerUid);

  const common = {
    ownerId: ownerUid,
    canonicalOwnerId: BOOKTOWN_CANONICAL_OWNER_ID,
    spaceType,
    spaceSubtype,
    identity,
    governanceStatus: managedByUid ? "claimed" : "published",
    authorityProfile,
    provenance: createSystemProvenance(caller.uid),
    stewardship,
    managedBy,
    communication,
    relationshipVisibility: buildRelationshipVisibility(),
    publication: buildPublicationLifecycle(),
    createdAt: now,
    updatedAt: now,
  };

  if (spaceType === "venue") {
    const address = requireString(data.address, "address", 240);
    await ref.set({
      ...common,
      name: displayName,
      nameLower: displayName.toLowerCase(),
      type: spaceSubtype,
      typeLower: spaceSubtype,
      address,
      imageUrl,
      openingHours: optionalString(data.openingHours, 240) || "",
      descriptionEn: optionalString(data.descriptionEn, 2000) || "",
      descriptionAr: optionalString(data.descriptionAr, 2000) || "",
      rating: 0,
      ratingsCount: 0,
      websiteUrl: optionalString(data.websiteUrl, 1024) || null,
      phone: optionalString(data.phone, 64) || null,
    });
  } else {
    const dateTime = requireString(data.dateTime, "dateTime", 64);
    const privacy = data.privacy === "private" ? "private" : "public";
    const isOnline = data.isOnline === true;
    const link = isOnline ? requireHttpsUrl(data.link, "link") : undefined;
    const venueName = isOnline ? undefined : requireString(data.venueName, "venueName", 120);
    await ref.set({
      ...common,
      titleEn: displayName,
      titleAr: optionalString(data.titleAr, 160) || displayName,
      titleLower: displayName.toLowerCase(),
      type: spaceSubtype,
      typeLower: spaceSubtype,
      dateTime,
      imageUrl,
      privacy,
      isOnline,
      ...(link ? { link } : {}),
      ...(venueName ? { venueName } : {}),
      eventState: eventStateFor(dateTime),
      recurrence: { kind: "none", schemaVersion: SPACE_SCHEMA_VERSION },
      continuity: {
        historicalRecord: true,
        visibility: privacy === "private" ? "private_record" : "public_history",
        lineageKind: "single_event",
        schemaVersion: SPACE_SCHEMA_VERSION,
      },
    });
  }

  await db.collection("space_inboxes").doc(communication.inboxId).set({
    spaceId: ref.id,
    spaceType,
    ownerUid,
    adminUids: [],
    status: "disabled",
    participantModel: "space_admins_only",
    createdAt: now,
    updatedAt: now,
    schemaVersion: SPACE_SCHEMA_VERSION,
  });

  await db.collection("space_authority_audit").doc().set({
    action: "admin_seed_space",
    spaceId: ref.id,
    spaceType,
    actorUid: caller.uid,
    managedByUid: managedByUid || null,
    institutionId: institutionId || null,
    createdAt: now,
  });

  return {
    spaceId: ref.id,
    spaceType,
    collectionName,
    identity,
    authorityProfile,
    managedByUid: managedByUid || null,
  };
});

export const adminAssignSpaceStewardship = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  assertRoleFromClaims(request.auth, "moderator");

  const data = request.data as Record<string, unknown>;
  const spaceType = normalizeSpaceType(data.spaceType);
  const spaceId = requireString(data.spaceId, "spaceId", 128);
  const managedByUid = requireString(data.managedByUid, "managedByUid", 128);
  const institutionId = optionalString(data.institutionId, 128);
  const collectionName = spaceType === "event" ? "events" : "venues";
  const ref = db.collection(collectionName).doc(spaceId);
  const now = admin.firestore.FieldValue.serverTimestamp();

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Space not found.");
    }
    const existing = snap.data() || {};
    const communication = buildCommunication(spaceId, managedByUid, []);
    const authorityProfile = {
      ...buildAuthorityProfile({ managedByUid, institutionId, callerUid: caller.uid }),
      ...(existing.authorityProfile && typeof existing.authorityProfile === "object"
        ? { seededBy: (existing.authorityProfile as Record<string, unknown>).seededBy || "booktown" }
        : {}),
    };
    const stewardship = {
      canonicalOwnerId: BOOKTOWN_CANONICAL_OWNER_ID,
      createdByUid: existing.stewardship?.createdByUid || existing.provenance?.createdByUid || caller.uid,
      managedByUid,
      adminUids: [],
      assignedByUid: caller.uid,
      ...(institutionId ? { institutionId } : {}),
      schemaVersion: SPACE_SCHEMA_VERSION,
    };

    transaction.update(ref, {
      ownerId: managedByUid,
      canonicalOwnerId: BOOKTOWN_CANONICAL_OWNER_ID,
      governanceStatus: institutionId ? "verified" : "claimed",
      authorityProfile,
      stewardship,
      managedBy: buildManagedBy({ callerUid: caller.uid, managedByUid, institutionId }),
      communication,
      updatedAt: now,
    });

    transaction.set(
      db.collection("space_inboxes").doc(communication.inboxId),
      {
        spaceId,
        spaceType,
        ownerUid: managedByUid,
        adminUids: [],
        status: "disabled",
        participantModel: "space_admins_only",
        updatedAt: now,
        schemaVersion: SPACE_SCHEMA_VERSION,
      },
      { merge: true }
    );
  });

  await db.collection("space_authority_audit").doc().set({
    action: "admin_assign_space_stewardship",
    spaceId,
    spaceType,
    actorUid: caller.uid,
    managedByUid,
    institutionId: institutionId || null,
    createdAt: now,
  });

  return { spaceId, spaceType, managedByUid };
});
