import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { admin } from "../firebaseAdmin";
import { assertRoleAtLeast } from "../control/assertRole";
import { logAdminAction } from "../control/auditLogger";
import { buildCatalogBookView, isPublicReadableBook } from "../catalog/catalogBookView";
import { resolveBookToEbookAttachment } from "../attachments/resolveBookToEbookAttachment";
import { unifiedSearch } from "../library/search/searchEngine";

const db = admin.firestore();
const COLLECTION = "home_editorial_slots";
const READ_NOW_MAX = 2;
const DYNAMIC_MAX = 2;
const TOWN_MAX = 3;
const DISCOVER_STREAM_MAX = 2;
const DISCOVER_STREAM_FEATURED_MAX = 1;
const DISCOVER_STREAMS = [
  "hiddenGems",
  "arabVoices",
  "recentlyDiscussed",
  "philosophicalFiction",
  "forgottenClassics",
  "shortReflectiveReads",
] as const;

const rowSchema = z.enum(["readNow", "dynamicDiscovery", "fromTheTown"]);
const modeSchema = z.enum(["hard_pin", "soft_boost"]);
const targetTypeSchema = z.enum(["book", "post"]);
const streamKeySchema = z.enum(DISCOVER_STREAMS);

const editorialEntrySchema = z.object({
  id: z.string().min(1).max(180).optional(),
  targetType: targetTypeSchema,
  targetId: z.string().min(1).max(180),
  row: rowSchema,
  streamKey: streamKeySchema.optional(),
  slot: z.number().int().min(0).max(2),
  mode: modeSchema,
  boostWeight: z.number().min(0).max(1),
  startAt: z.string().min(1).max(80),
  endAt: z.string().min(1).max(80),
  regions: z.array(z.string().min(1).max(24)).max(16),
  languages: z.array(z.string().min(1).max(12)).max(12),
  editorialReason: z.string().min(1).max(500),
  isActive: z.boolean(),
});

type EditorialInput = z.infer<typeof editorialEntrySchema>;
type Row = EditorialInput["row"];
type TargetType = EditorialInput["targetType"];
type StreamKey = z.infer<typeof streamKeySchema>;

const searchHomeTargetsSchema = z.object({
  query: z.string().min(1).max(300),
  row: rowSchema,
  streamKey: streamKeySchema.optional(),
  limit: z.number().int().min(1).max(12).optional(),
});

const resolveHomeTargetSchema = z
  .object({
    input: z.string().min(1).max(500).optional(),
    candidate: z
      .object({
        targetType: targetTypeSchema,
        targetId: z.string().min(1).max(180),
      })
      .strict()
      .optional(),
    row: rowSchema,
    streamKey: streamKeySchema.optional(),
    targetType: targetTypeSchema.optional(),
  })
  .strict()
  .refine((value) => Boolean(value.input || value.candidate), {
    message: "Provide a target input or canonical candidate.",
  });

const previewHomePlacementSchema = editorialEntrySchema.extend({
  id: z.string().min(1).max(180).optional(),
});

function rowTargetType(row: Row): TargetType {
  return row === "fromTheTown" ? "post" : "book";
}

function streamLabel(streamKey?: string): string | null {
  if (!streamKey) return null;
  return streamKey
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase());
}

function asString(value: unknown, maxLen = 300): string {
  return typeof value === "string" ? value.trim().slice(0, maxLen) : "";
}

function getBookTargetId(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/\/books\/([^/?#]+)/i);
  if (urlMatch?.[1]) return decodeURIComponent(urlMatch[1]).trim();
  return trimmed;
}

function getPostTargetId(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/\/posts?\/([^/?#]+)/i);
  if (urlMatch?.[1]) return decodeURIComponent(urlMatch[1]).trim();
  return trimmed;
}

function moderationSafe(data: Record<string, unknown>): boolean {
  const moderation = data.moderation && typeof data.moderation === "object"
    ? data.moderation as Record<string, unknown>
    : {};
  return moderation.autoHidden !== true && moderation.status !== "hidden" && moderation.stage !== "blocked";
}

async function validateTarget(params: {
  targetType: TargetType;
  targetId: string;
  row: Row;
}): Promise<{
  blocking: string[];
  warnings: string[];
  status: Record<string, unknown>;
  preview: Record<string, unknown> | null;
}> {
  const { targetType, targetId, row } = params;
  const ref = db.collection(targetType === "book" ? "books" : "posts").doc(targetId);
  const snap = await ref.get();
  if (!snap.exists) {
    return {
      blocking: ["Target does not exist."],
      warnings: [],
      status: { exists: false, eligible: false },
      preview: null,
    };
  }

  const data = (snap.data() ?? {}) as Record<string, unknown>;
  if (targetType === "book") {
    const readable = isPublicReadableBook(data);
    const attachment = await resolveBookToEbookAttachment(targetId).catch(() => null);
    const hasReadableManifestation = Boolean(attachment?.storagePath);
    const blocking = [
      ...(!readable ? ["Book is not public and readable."] : []),
      ...(row === "readNow" && !hasReadableManifestation ? ["Ready to Read requires an in-app Manifestation."] : []),
    ];
    const book = await buildCatalogBookView(targetId, data);
    return {
      blocking,
      warnings: row === "dynamicDiscovery" && !hasReadableManifestation ? ["Book has no in-app Manifestation."] : [],
      status: {
        exists: true,
        eligible: blocking.length === 0,
        visibility: asString(data.visibility, 32) || "public",
        readable,
        hasReadableManifestation,
        hasEbookAttachment: hasReadableManifestation,
        moderationSafe: true,
      },
      preview: {
        type: "book",
        id: targetId,
        title: book.titleEn || book.titleAr,
        subtitle: book.authorEn || book.authorAr,
        coverUrl: book.coverUrl,
        isEbookAvailable: book.isEbookAvailable,
      },
    };
  }

  const published = asString(data.status, 32) === "published";
  const publicVisible = asString(data.visibility, 32) === "public";
  const deleted = data.isDeleted === true;
  const safe = moderationSafe(data);
  const blocking = [
    ...(!published ? ["Post is not published."] : []),
    ...(!publicVisible ? ["Post is not public."] : []),
    ...(deleted ? ["Post is deleted."] : []),
    ...(!safe ? ["Post is under moderation restriction."] : []),
  ];
  return {
    blocking,
    warnings: [],
    status: {
      exists: true,
      eligible: blocking.length === 0,
      visibility: asString(data.visibility, 32),
      status: asString(data.status, 32),
      moderationSafe: safe,
      deleted,
    },
    preview: {
      type: "post",
      id: targetId,
      title: asString(data.title, 160) || asString(data.text, 160) || "Literary signal",
      subtitle: asString(data.authorName, 120) || "From the Town",
      text: asString(data.text, 240),
    },
  };
}

function requireStreamForDiscover(input: { row: Row; streamKey?: StreamKey }): void {
  if (input.row === "dynamicDiscovery" && !input.streamKey) {
    throw new HttpsError("invalid-argument", "Discover placements require a stream.");
  }
  if (input.row !== "dynamicDiscovery" && input.streamKey) {
    throw new HttpsError("invalid-argument", "Only Discover placements may use a stream.");
  }
}

function parseDate(value: string, field: string): Timestamp {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new HttpsError("invalid-argument", `${field} must be a valid date.`);
  }
  return Timestamp.fromDate(date);
}

function maxSlots(row: "readNow" | "dynamicDiscovery" | "fromTheTown"): number {
  if (row === "readNow") return READ_NOW_MAX;
  return row === "dynamicDiscovery" ? DYNAMIC_MAX : TOWN_MAX;
}

function assertTargetCompatible(input: EditorialInput): void {
  requireStreamForDiscover(input);
  if ((input.row === "readNow" || input.row === "dynamicDiscovery") && input.targetType !== "book") {
    throw new HttpsError("invalid-argument", "Ready to Read and Discover editorial targets must be books.");
  }
  if (input.row === "fromTheTown" && input.targetType !== "post") {
    throw new HttpsError("invalid-argument", "From the Town editorial targets must be posts.");
  }
  if (input.slot >= maxSlots(input.row)) {
    throw new HttpsError("invalid-argument", "Slot index exceeds row editorial capacity.");
  }
}

async function assertTargetExists(input: EditorialInput): Promise<void> {
  const collectionName = input.targetType === "book" ? "books" : "posts";
  const snap = await db.collection(collectionName).doc(input.targetId).get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "Editorial target does not exist.");
  }
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  if (input.targetType === "post") {
    if (data.status !== "published" || data.visibility !== "public" || data.isDeleted === true) {
      throw new HttpsError("failed-precondition", "Editorial post target is not publicly renderable.");
    }
  }
  if (input.row === "readNow") {
    if (!isPublicReadableBook(data)) {
      throw new HttpsError("failed-precondition", "Ready to Read editorial book is not publicly readable.");
    }
    const attachment = await resolveBookToEbookAttachment(input.targetId);
    if (!attachment || !attachment.storagePath) {
      throw new HttpsError("failed-precondition", "Ready to Read editorial book is not readable in app.");
    }
  }
}

async function assertNoSlotCollision(input: EditorialInput): Promise<void> {
  if (!input.isActive) return;
  let query: FirebaseFirestore.Query = db
    .collection(COLLECTION)
    .where("row", "==", input.row)
    .where("slot", "==", input.slot)
    .where("isActive", "==", true);
  if (input.row === "dynamicDiscovery" && input.streamKey) {
    query = query.where("streamKey", "==", input.streamKey);
  }
  const snap = await query.limit(10).get();
  const collisions = snap.docs.filter((docSnap) => docSnap.id !== input.id);
  if (collisions.length > 0) {
    throw new HttpsError("failed-precondition", "Editorial slot collision.");
  }
}

async function assertOccupancy(input: EditorialInput): Promise<void> {
  if (!input.isActive) return;
  const now = Timestamp.now();
  let query: FirebaseFirestore.Query = db
    .collection(COLLECTION)
    .where("row", "==", input.row)
    .where("isActive", "==", true);
  if (input.row === "dynamicDiscovery" && input.streamKey) {
    query = query.where("streamKey", "==", input.streamKey);
  }
  const limit = input.row === "dynamicDiscovery" ? DISCOVER_STREAM_MAX : maxSlots(input.row);
  const snap = await query.limit(limit + 4).get();
  const active = snap.docs.filter((docSnap) => {
    if (docSnap.id === input.id) return false;
    const endAt = docSnap.get("endAt");
    return endAt instanceof Timestamp && endAt.toMillis() > now.toMillis();
  });
  if (active.length >= limit) {
    throw new HttpsError("failed-precondition", "Editorial occupancy limit exceeded.");
  }
  if (input.row === "dynamicDiscovery" && input.mode === "hard_pin") {
    const featuredCount = active.filter((docSnap) => docSnap.get("mode") === "hard_pin").length;
    if (featuredCount >= DISCOVER_STREAM_FEATURED_MAX) {
      throw new HttpsError("failed-precondition", "Discover stream already has a featured placement.");
    }
  }
}

function serializeDoc(docSnap: FirebaseFirestore.DocumentSnapshot): Record<string, unknown> {
  const data = (docSnap.data() ?? {}) as Record<string, unknown>;
  const startAt = data.startAt instanceof Timestamp ? data.startAt.toDate().toISOString() : "";
  const endAt = data.endAt instanceof Timestamp ? data.endAt.toDate().toISOString() : "";
  const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : null;
  const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : null;
  return {
    id: docSnap.id,
    targetType: data.targetType,
    targetId: data.targetId,
    row: data.row,
    streamKey: data.streamKey,
    slot: data.slot,
    mode: data.mode,
    boostWeight: data.boostWeight,
    startAt,
    endAt,
    regions: Array.isArray(data.regions) ? data.regions : [],
    languages: Array.isArray(data.languages) ? data.languages : [],
    editorialReason: data.editorialReason,
    createdBy: data.createdBy,
    createdAt,
    updatedAt,
    isActive: data.isActive === true,
  };
}

async function audit(caller: { uid: string; role: string }, actionType: string, targetId: string, payload: unknown): Promise<void> {
  await logAdminAction({
    actorUid: caller.uid,
    actorRole: caller.role,
    actionType,
    targetType: "home_editorial_slot",
    targetId,
    payloadSnapshot: payload,
  });
}

async function buildPlacementPreview(input: EditorialInput): Promise<Record<string, unknown>> {
  const validation = await validateTarget({
    targetType: input.targetType,
    targetId: input.targetId,
    row: input.row,
  });
  const startAt = parseDate(input.startAt, "startAt");
  const endAt = parseDate(input.endAt, "endAt");
  const now = Timestamp.now();
  let query: FirebaseFirestore.Query = db
    .collection(COLLECTION)
    .where("row", "==", input.row)
    .where("isActive", "==", true);
  if (input.row === "dynamicDiscovery" && input.streamKey) {
    query = query.where("streamKey", "==", input.streamKey);
  }
  const snap = await query.limit(20).get();
  const active = snap.docs
    .filter((docSnap) => docSnap.id !== input.id)
    .filter((docSnap) => {
      const end = docSnap.get("endAt");
      return end instanceof Timestamp && end.toMillis() > now.toMillis();
    });
  const limit = input.row === "dynamicDiscovery" ? DISCOVER_STREAM_MAX : maxSlots(input.row);
  const sameTarget = active.filter((docSnap) => docSnap.get("targetId") === input.targetId);
  const slotCollision = active.filter((docSnap) => docSnap.get("slot") === input.slot);
  const featuredCount = active.filter((docSnap) => docSnap.get("mode") === "hard_pin").length;
  const globalTargetSnap = await db
    .collection(COLLECTION)
    .where("targetType", "==", input.targetType)
    .where("targetId", "==", input.targetId)
    .limit(20)
    .get();
  const crossLayerTarget = globalTargetSnap.docs
    .filter((docSnap) => docSnap.id !== input.id)
    .filter((docSnap) => docSnap.get("isActive") === true)
    .filter((docSnap) => {
      const end = docSnap.get("endAt");
      return end instanceof Timestamp && end.toMillis() > now.toMillis();
    })
    .filter((docSnap) => {
      const sameRow = docSnap.get("row") === input.row;
      const sameStream = (docSnap.get("streamKey") ?? null) === (input.streamKey ?? null);
      return !sameRow || !sameStream;
    });
  const blocking = [
    ...validation.blocking,
    ...(input.row === "dynamicDiscovery" && !input.streamKey ? ["Discover placements require a stream."] : []),
    ...(endAt.toMillis() <= startAt.toMillis() || endAt.toMillis() <= Date.now()
      ? ["End time must be after start time and in the future."]
      : []),
    ...(active.length >= limit && !input.id ? ["This layer or stream is at editorial capacity."] : []),
    ...(slotCollision.length > 0 ? ["Placement position is already occupied."] : []),
    ...(sameTarget.length > 0 ? ["This target is already programmed in this layer or stream."] : []),
    ...(crossLayerTarget.length > 0 ? ["This target is already active in another Home layer or stream."] : []),
    ...(input.row === "dynamicDiscovery" &&
    input.mode === "hard_pin" &&
    featuredCount >= DISCOVER_STREAM_FEATURED_MAX
      ? ["This Discover stream already has a featured placement."]
      : []),
  ];
  return {
    target: validation.preview,
    eligibility: validation.status,
    blocking,
    warnings: validation.warnings,
    occupancy: {
      row: input.row,
      streamKey: input.streamKey ?? null,
      streamLabel: streamLabel(input.streamKey),
      activeCount: active.length,
      max: limit,
      featuredCount,
      maxFeatured: input.row === "dynamicDiscovery" ? DISCOVER_STREAM_FEATURED_MAX : null,
    },
    conflicts: {
      slotCollisionIds: slotCollision.map((docSnap) => docSnap.id),
      sameTargetIds: sameTarget.map((docSnap) => docSnap.id),
      crossLayerTargetIds: crossLayerTarget.map((docSnap) => docSnap.id),
    },
    schedule: {
      startAt: startAt.toDate().toISOString(),
      endAt: endAt.toDate().toISOString(),
    },
    canActivate: blocking.length === 0,
  };
}

export const adminListHomeEditorialEntries = onCall({ cors: true }, async (request) => {
  assertRoleAtLeast(request, "superadmin");
  const snap = await db.collection(COLLECTION).orderBy("row", "asc").orderBy("slot", "asc").limit(100).get();
  return {
    entries: snap.docs.map((docSnap) => serializeDoc(docSnap)),
  };
});

export const adminSearchHomeTargets = onCall({ cors: true }, async (request) => {
  assertRoleAtLeast(request, "superadmin");
  const parsed = searchHomeTargetsSchema.safeParse(request.data ?? {});
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "Invalid target search.");
  }
  const { query, row, limit = 8 } = parsed.data;
  const targetType = rowTargetType(row);

  if (targetType === "book") {
    const result = await unifiedSearch(query, {
      limit,
      availabilityOnly: row === "readNow",
      ebookOnly: row === "readNow",
    });
    const candidates = result.results
      .filter((entry) => entry.resultType === "canonical")
      .slice(0, limit);
    const targets = await Promise.all(candidates.map(async (entry) => {
      const targetId = entry.bookId || entry.id;
      const validation = await validateTarget({ targetType: "book", targetId, row });
      return {
        targetType: "book",
        targetId,
        label: entry.title,
        subtitle: entry.authorEn || entry.authorAr,
        source: "canonical_search",
        preview: validation.preview,
        eligibility: validation.status,
        blocking: validation.blocking,
        warnings: validation.warnings,
      };
    }));
    return { targets };
  }

  const normalized = query.trim().toLowerCase();
  const snap = await db
    .collection("posts")
    .where("status", "==", "published")
    .where("visibility", "==", "public")
    .limit(50)
    .get();
  const targets = [];
  for (const docSnap of snap.docs) {
    if (targets.length >= limit) break;
    const data = (docSnap.data() ?? {}) as Record<string, unknown>;
    const haystack = [
      asString(data.title, 160),
      asString(data.text, 500),
      asString(data.authorName, 160),
    ].join(" ").toLowerCase();
    if (normalized.length >= 2 && !haystack.includes(normalized) && docSnap.id !== query.trim()) continue;
    const validation = await validateTarget({ targetType: "post", targetId: docSnap.id, row });
    targets.push({
      targetType: "post",
      targetId: docSnap.id,
      label: asString(data.title, 160) || asString(data.text, 160) || "Literary signal",
      subtitle: asString(data.authorName, 120) || "From the Town",
      source: "canonical_search",
      preview: validation.preview,
      eligibility: validation.status,
      blocking: validation.blocking,
      warnings: validation.warnings,
    });
  }
  return { targets };
});

export const adminResolveHomeTarget = onCall({ cors: true }, async (request) => {
  assertRoleAtLeast(request, "superadmin");
  const parsed = resolveHomeTargetSchema.safeParse(request.data ?? {});
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "Invalid target resolver request.");
  }
  const row = parsed.data.row;
  const targetType = parsed.data.candidate?.targetType ?? parsed.data.targetType ?? rowTargetType(row);
  const targetId = parsed.data.candidate?.targetId
    ?? (targetType === "book"
      ? getBookTargetId(parsed.data.input ?? "")
      : getPostTargetId(parsed.data.input ?? ""));
  const validation = await validateTarget({ targetType, targetId, row });
  return {
    target: validation.preview
      ? {
          targetType,
          targetId,
          label: String(validation.preview.title ?? targetId),
          subtitle: String(validation.preview.subtitle ?? ""),
          source: "canonical_resolver",
          preview: validation.preview,
          eligibility: validation.status,
          blocking: validation.blocking,
          warnings: validation.warnings,
        }
      : null,
  };
});

export const adminPreviewHomePlacement = onCall({ cors: true }, async (request) => {
  assertRoleAtLeast(request, "superadmin");
  const parsed = previewHomePlacementSchema.safeParse(request.data ?? {});
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "Invalid placement preview.");
  }
  assertTargetCompatible(parsed.data);
  return {
    preview: await buildPlacementPreview(parsed.data),
  };
});

export const adminUpsertHomeEditorialEntry = onCall({ cors: true }, async (request) => {
  const caller = assertRoleAtLeast(request, "superadmin");
  const parsed = editorialEntrySchema.safeParse(request.data ?? {});
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "Invalid editorial entry.");
  }
  const input = parsed.data;
  assertTargetCompatible(input);
  const placementPreview = await buildPlacementPreview(input);
  if (input.isActive && Array.isArray(placementPreview.blocking) && placementPreview.blocking.length > 0) {
    await audit(caller, "HOME_EDITORIAL_INVALID_ACTIVATION", input.id ?? "new", {
      input,
      blocking: placementPreview.blocking,
    });
    throw new HttpsError("failed-precondition", "Placement has blocking preview issues.");
  }
  const startAt = parseDate(input.startAt, "startAt");
  const endAt = parseDate(input.endAt, "endAt");
  if (endAt.toMillis() <= startAt.toMillis() || endAt.toMillis() <= Date.now()) {
    throw new HttpsError("invalid-argument", "endAt must be after startAt and in the future.");
  }
  await assertTargetExists(input);
  await assertNoSlotCollision(input);
  await assertOccupancy(input);

  const ref = input.id ? db.collection(COLLECTION).doc(input.id) : db.collection(COLLECTION).doc();
  const payload = {
    targetType: input.targetType,
    targetId: input.targetId,
    row: input.row,
    ...(input.streamKey ? { streamKey: input.streamKey } : { streamKey: FieldValue.delete() }),
    rowType: input.row,
    entityType: input.targetType,
    entityId: input.targetId,
    slot: input.slot,
    position: input.slot,
    mode: input.mode,
    slotKind: input.mode,
    boostWeight: input.boostWeight,
    startAt,
    endAt,
    expiresAt: endAt,
    regions: input.regions,
    languages: input.languages,
    editorialReason: input.editorialReason,
    isActive: input.isActive,
    status: input.isActive ? "active" : "disabled",
    updatedAt: FieldValue.serverTimestamp(),
    ...(input.id ? {} : { createdBy: caller.uid, createdAt: FieldValue.serverTimestamp() }),
  };
  await ref.set(payload, { merge: true });
  await audit(caller, input.id ? "HOME_EDITORIAL_UPDATED" : "HOME_EDITORIAL_CREATED", ref.id, input);
  const snap = await ref.get();
  return { entry: serializeDoc(snap) };
});

export const adminDisableHomeEditorialEntry = onCall({ cors: true }, async (request) => {
  const caller = assertRoleAtLeast(request, "superadmin");
  const id = typeof request.data?.id === "string" ? request.data.id.trim() : "";
  if (!id) throw new HttpsError("invalid-argument", "id is required.");
  await db.collection(COLLECTION).doc(id).set({
    isActive: false,
    status: "disabled",
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await audit(caller, "HOME_EDITORIAL_DISABLED", id, { id });
  return { id, disabled: true };
});

export const adminDeleteHomeEditorialEntry = onCall({ cors: true }, async (request) => {
  const caller = assertRoleAtLeast(request, "superadmin");
  const id = typeof request.data?.id === "string" ? request.data.id.trim() : "";
  if (!id) throw new HttpsError("invalid-argument", "id is required.");
  await db.collection(COLLECTION).doc(id).delete();
  await audit(caller, "HOME_EDITORIAL_DELETED", id, { id });
  return { id, deleted: true };
});

export const adminPreviewHomeEditorialConsole = onCall({ cors: true }, async (request) => {
  assertRoleAtLeast(request, "superadmin");
  const region = typeof request.data?.region === "string" ? request.data.region.trim() : "";
  const language = typeof request.data?.language === "string" ? request.data.language.trim() : "";
  const now = Timestamp.now();
  const snap = await db.collection(COLLECTION).orderBy("row", "asc").orderBy("slot", "asc").limit(100).get();
  const active = snap.docs
    .map((docSnap) => serializeDoc(docSnap))
    .filter((entry) => {
      if (entry.isActive !== true) return false;
      const endAt = Date.parse(String(entry.endAt));
      if (!Number.isFinite(endAt) || endAt <= now.toMillis()) return false;
      const regions = Array.isArray(entry.regions) ? entry.regions.map(String) : [];
      const languages = Array.isArray(entry.languages) ? entry.languages.map(String) : [];
      if (region && regions.length > 0 && !regions.includes(region)) return false;
      if (language && languages.length > 0 && !languages.includes(language)) return false;
      return true;
    });
  return {
    preview: {
      region: region || null,
      language: language || null,
      rows: [
        {
          row: "readNow",
          editorialCount: active.filter((entry) => entry.row === "readNow").length,
          maxEditorial: READ_NOW_MAX,
        },
        {
          row: "dynamicDiscovery",
          editorialCount: active.filter((entry) => entry.row === "dynamicDiscovery").length,
          maxEditorial: DYNAMIC_MAX,
        },
        {
          row: "fromTheTown",
          editorialCount: active.filter((entry) => entry.row === "fromTheTown").length,
          maxEditorial: TOWN_MAX,
        },
      ],
      streams: DISCOVER_STREAMS.map((streamKey) => ({
        streamKey,
        streamLabel: streamLabel(streamKey),
        editorialCount: active.filter((entry) => entry.row === "dynamicDiscovery" && entry.streamKey === streamKey).length,
        featuredCount: active.filter((entry) => entry.row === "dynamicDiscovery" && entry.streamKey === streamKey && entry.mode === "hard_pin").length,
        maxEditorial: DISCOVER_STREAM_MAX,
        maxFeatured: DISCOVER_STREAM_FEATURED_MAX,
      })),
      entries: active,
    },
  };
});
