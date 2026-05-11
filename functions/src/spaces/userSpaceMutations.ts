import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import {
  assertActiveAuthenticatedUser,
  getRoleFromClaims,
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

function requireIsoDate(value: unknown, fieldName: string): string {
  const input = requireString(value, fieldName, 64);
  const parsed = new Date(input);
  if (!Number.isFinite(parsed.getTime())) {
    throw new HttpsError("invalid-argument", `${fieldName} must be a valid datetime.`);
  }
  return parsed.toISOString();
}

function sanitizeVenueLocation(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "location must be an object.");
  }
  const source = value as Record<string, unknown>;
  const latitude = source.latitude;
  const longitude = source.longitude;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new HttpsError("invalid-argument", "location.latitude is invalid.");
  }
  if (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new HttpsError("invalid-argument", "location.longitude is invalid.");
  }
  return {
    latitude: Number(latitude.toFixed(7)),
    longitude: Number(longitude.toFixed(7)),
    ...(optionalString(source.placeId, 128) ? { placeId: optionalString(source.placeId, 128) } : {}),
    ...(optionalString(source.city, 120) ? { city: optionalString(source.city, 120) } : {}),
    ...(optionalString(source.country, 120) ? { country: optionalString(source.country, 120) } : {}),
  };
}

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const TIME_24H_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function sanitizeOpeningSchedule(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "openingSchedule must be an object.");
  }
  const source = value as Record<string, unknown>;
  const schedule: Record<string, { closed: boolean; open: string | null; close: string | null }> = {};
  for (const day of WEEKDAY_KEYS) {
    const dayValue = source[day];
    if (!dayValue || typeof dayValue !== "object" || Array.isArray(dayValue)) {
      schedule[day] = { closed: true, open: null, close: null };
      continue;
    }
    const dayRecord = dayValue as Record<string, unknown>;
    const closed = dayRecord.closed === true;
    const open = optionalString(dayRecord.open, 5) || null;
    const close = optionalString(dayRecord.close, 5) || null;
    if (!closed && (!open || !close || !TIME_24H_PATTERN.test(open) || !TIME_24H_PATTERN.test(close))) {
      throw new HttpsError("invalid-argument", `openingSchedule.${day} is invalid.`);
    }
    schedule[day] = {
      closed,
      open: closed ? null : open,
      close: closed ? null : close,
    };
  }
  return schedule;
}

function normalizeSpaceType(value: unknown): SpaceType {
  if (value === "venue" || value === "event") return value;
  throw new HttpsError("invalid-argument", "spaceType must be venue or event.");
}

function normalizeSubtype(spaceType: SpaceType, value: unknown, isOnline = false): VenueSubtype | EventSubtype {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (spaceType === "venue" && VENUE_SUBTYPES.has(normalized as VenueSubtype)) {
    return normalized as VenueSubtype;
  }
  if (spaceType === "event") {
    if (EVENT_SUBTYPES.has(normalized as EventSubtype)) return normalized as EventSubtype;
    if (isOnline) return "online_session";
  }
  return "other";
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

function updateDisplayIdentity(existing: Record<string, unknown>, spaceType: SpaceType, spaceId: string, displayName: string) {
  const identity =
    existing.identity && typeof existing.identity === "object"
      ? (existing.identity as Record<string, unknown>)
      : createIdentity(spaceType, spaceId, displayName);
  return {
    ...identity,
    canonicalId:
      typeof identity.canonicalId === "string" && identity.canonicalId
        ? identity.canonicalId
        : `${spaceType}_${spaceId}`,
    slug:
      typeof identity.slug === "string" && identity.slug
        ? identity.slug
        : createIdentity(spaceType, spaceId, displayName).slug,
    routePath:
      typeof identity.routePath === "string" && identity.routePath
        ? identity.routePath
        : createIdentity(spaceType, spaceId, displayName).routePath,
    displayName,
    normalizedName: displayName.toLowerCase(),
    schemaVersion: SPACE_SCHEMA_VERSION,
  };
}

function userProvenance(uid: string) {
  return {
    source: "user_created",
    canonicalAuthority: "user_submitted",
    schemaVersion: SPACE_SCHEMA_VERSION,
    createdByUid: uid,
  };
}

function communityAuthorityProfile() {
  return {
    claimState: "unclaimed",
    stewardshipState: "community_created",
    schemaVersion: SPACE_SCHEMA_VERSION,
  };
}

function stewardship(uid: string) {
  return {
    canonicalOwnerId: BOOKTOWN_CANONICAL_OWNER_ID,
    createdByUid: uid,
    managedByUid: uid,
    adminUids: [],
    schemaVersion: SPACE_SCHEMA_VERSION,
  };
}

function communication(spaceId: string, ownerUid: string, adminUids: string[] = []) {
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

function relationshipVisibility() {
  return {
    venue: "public",
    organization: "public",
    books: "private",
    authors: "private",
    series: "private",
    schemaVersion: SPACE_SCHEMA_VERSION,
  };
}

function publicationLifecycle() {
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

function isAdminRole(role: string): boolean {
  return role === "moderator" || role === "superadmin" || role === "system";
}

function canManageSpace(data: Record<string, unknown>, uid: string, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  if (data.ownerId === uid) return true;
  const steward = data.stewardship && typeof data.stewardship === "object"
    ? (data.stewardship as Record<string, unknown>)
    : {};
  if (steward.managedByUid === uid) return true;
  return Array.isArray(steward.adminUids) && steward.adminUids.includes(uid);
}

function collectionFor(spaceType: SpaceType): "venues" | "events" {
  return spaceType === "event" ? "events" : "venues";
}

async function assertReferencedVenue(locationId: string | undefined): Promise<string | undefined> {
  if (!locationId) return undefined;
  const snap = await db.collection("venues").doc(locationId).get();
  if (!snap.exists) {
    throw new HttpsError("invalid-argument", "locationId must reference an existing venue.");
  }
  const data = snap.data() || {};
  return typeof data.name === "string" && data.name.trim() ? data.name.trim() : undefined;
}

export const createUserSpace = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const data = request.data as Record<string, unknown>;
  const spaceType = normalizeSpaceType(data.spaceType);
  const isOnline = data.isOnline === true;
  const spaceSubtype = normalizeSubtype(spaceType, data.spaceSubtype || data.type, isOnline);
  const displayName = requireString(data.displayName || data.name || data.titleEn, "displayName", 160);
  const imageUrl = requireHttpsUrl(data.imageUrl, "imageUrl");
  const ref = db.collection(collectionFor(spaceType)).doc();
  const now = admin.firestore.FieldValue.serverTimestamp();
  const identity = createIdentity(spaceType, ref.id, displayName);
  const base = {
    ownerId: caller.uid,
    canonicalOwnerId: BOOKTOWN_CANONICAL_OWNER_ID,
    spaceType,
    spaceSubtype,
    identity,
    governanceStatus: "published",
    authorityProfile: communityAuthorityProfile(),
    provenance: userProvenance(caller.uid),
    stewardship: stewardship(caller.uid),
    managedBy: {
      primaryUid: caller.uid,
      adminUids: [],
      schemaVersion: SPACE_SCHEMA_VERSION,
    },
    communication: communication(ref.id, caller.uid),
    relationshipVisibility: relationshipVisibility(),
    publication: publicationLifecycle(),
    createdAt: now,
    updatedAt: now,
  };

  if (spaceType === "venue") {
    await ref.set({
      ...base,
      name: displayName,
      nameLower: displayName.toLowerCase(),
      type: spaceSubtype,
      typeLower: spaceSubtype,
      address: requireString(data.address, "address", 240),
      imageUrl,
      openingHours: optionalString(data.openingHours, 240) || "",
      openingSchedule: sanitizeOpeningSchedule(data.openingSchedule),
      location: sanitizeVenueLocation(data.location),
      descriptionEn: optionalString(data.descriptionEn, 2000) || "",
      descriptionAr: optionalString(data.descriptionAr, 2000) || "",
      rating: 0,
      ratingsCount: 0,
      websiteUrl: optionalString(data.websiteUrl, 1024) || null,
      phone: optionalString(data.phone, 64) || null,
    });
  } else {
    const dateTime = requireIsoDate(data.dateTime, "dateTime");
    const privacy = data.privacy === "private" ? "private" : "public";
    const locationId = isOnline ? undefined : optionalString(data.locationId, 128);
    const linkedVenueName = await assertReferencedVenue(locationId);
    const venueName = isOnline
      ? undefined
      : linkedVenueName || requireString(data.venueName, "venueName", 120);
    const link = isOnline ? requireHttpsUrl(data.link, "link") : undefined;
    await ref.set({
      ...base,
      titleEn: displayName,
      titleAr: optionalString(data.titleAr, 160) || displayName,
      titleLower: displayName.toLowerCase(),
      type: spaceSubtype,
      typeLower: spaceSubtype,
      dateTime,
      imageUrl,
      privacy,
      duration: optionalString(data.duration, 120) || null,
      isOnline,
      ...(locationId ? { locationId } : {}),
      ...(venueName ? { venueName } : {}),
      ...(link ? { link } : {}),
      eventState: eventStateFor(dateTime),
      recurrence: { kind: "none", schemaVersion: SPACE_SCHEMA_VERSION },
      continuity: {
        historicalRecord: true,
        visibility: privacy === "private" ? "private_record" : "public_history",
        lineageKind: "single_event",
        schemaVersion: SPACE_SCHEMA_VERSION,
      },
      relationshipRefs: locationId ? { venueId: locationId } : {},
    });
  }

  await db.collection("space_inboxes").doc(`space_${ref.id}`).set({
    spaceId: ref.id,
    spaceType,
    ownerUid: caller.uid,
    adminUids: [],
    status: "disabled",
    participantModel: "space_admins_only",
    createdAt: now,
    updatedAt: now,
    schemaVersion: SPACE_SCHEMA_VERSION,
  });

  return { spaceId: ref.id, spaceType, collectionName: collectionFor(spaceType), identity };
});

export const updateUserSpace = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const role = getRoleFromClaims(request.auth);
  const data = request.data as Record<string, unknown>;
  const spaceType = normalizeSpaceType(data.spaceType);
  const spaceId = requireString(data.spaceId, "spaceId", 128);
  const ref = db.collection(collectionFor(spaceType)).doc(spaceId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Space not found.");
  }

  const existing = snap.data() || {};
  if (!canManageSpace(existing, caller.uid, isAdminRole(role))) {
    throw new HttpsError("permission-denied", "Not authorized to manage this Space.");
  }

  const isOnline = data.isOnline === true;
  const displayName = requireString(data.displayName || data.name || data.titleEn, "displayName", 160);
  const spaceSubtype = normalizeSubtype(spaceType, data.spaceSubtype || data.type || existing.spaceSubtype, isOnline);
  const imageUrl = requireHttpsUrl(data.imageUrl, "imageUrl");
  const now = admin.firestore.FieldValue.serverTimestamp();
  const baseUpdate = {
    spaceSubtype,
    identity: updateDisplayIdentity(existing, spaceType, spaceId, displayName),
    type: spaceSubtype,
    typeLower: spaceSubtype,
    publication: publicationLifecycle(),
    updatedAt: now,
  };

  if (spaceType === "venue") {
    await ref.update({
      ...baseUpdate,
      name: displayName,
      nameLower: displayName.toLowerCase(),
      address: requireString(data.address, "address", 240),
      imageUrl,
      openingHours: optionalString(data.openingHours, 240) || "",
      openingSchedule: sanitizeOpeningSchedule(data.openingSchedule),
      location: sanitizeVenueLocation(data.location),
      descriptionEn: optionalString(data.descriptionEn, 2000) || "",
      descriptionAr: optionalString(data.descriptionAr, 2000) || "",
      websiteUrl: optionalString(data.websiteUrl, 1024) || null,
      phone: optionalString(data.phone, 64) || null,
    });
  } else {
    const dateTime = requireIsoDate(data.dateTime, "dateTime");
    const privacy = data.privacy === "private" ? "private" : "public";
    const locationId = isOnline ? undefined : optionalString(data.locationId, 128);
    const linkedVenueName = await assertReferencedVenue(locationId);
    const venueName = isOnline
      ? undefined
      : linkedVenueName || requireString(data.venueName, "venueName", 120);
    const link = isOnline ? requireHttpsUrl(data.link, "link") : undefined;
    const existingContinuity =
      existing.continuity && typeof existing.continuity === "object"
        ? (existing.continuity as Record<string, unknown>)
        : {};
    const lineageKind =
      existingContinuity.lineageKind === "series_occurrence" ||
      existingContinuity.lineageKind === "series_template" ||
      existingContinuity.lineageKind === "single_event"
        ? existingContinuity.lineageKind
        : "single_event";
    const seriesId = optionalString(existingContinuity.seriesId, 128);
    await ref.update({
      ...baseUpdate,
      titleEn: displayName,
      titleAr: optionalString(data.titleAr, 160) || displayName,
      titleLower: displayName.toLowerCase(),
      dateTime,
      imageUrl,
      privacy,
      duration: optionalString(data.duration, 120) || null,
      isOnline,
      locationId: locationId || null,
      venueName: venueName || null,
      link: link || null,
      eventState: eventStateFor(dateTime),
      continuity: {
        historicalRecord: true,
        visibility: privacy === "private" ? "private_record" : "public_history",
        lineageKind,
        ...(seriesId ? { seriesId } : {}),
        schemaVersion: SPACE_SCHEMA_VERSION,
      },
      relationshipRefs: locationId ? { venueId: locationId } : {},
    });
  }

  return { spaceId, spaceType };
});
