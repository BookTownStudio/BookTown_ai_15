import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { admin } from "../firebaseAdmin";
import { assertRoleAtLeast } from "../control/assertRole";
import { logAdminAction } from "../control/auditLogger";
import { isPublicReadableBook } from "../catalog/catalogBookView";
import { resolveBookToEbookAttachment } from "../attachments/resolveBookToEbookAttachment";

const db = admin.firestore();
const COLLECTION = "home_editorial_slots";
const READ_NOW_MAX = 2;
const DYNAMIC_MAX = 2;
const TOWN_MAX = 3;

const rowSchema = z.enum(["readNow", "dynamicDiscovery", "fromTheTown"]);
const modeSchema = z.enum(["hard_pin", "soft_boost"]);
const targetTypeSchema = z.enum(["book", "post"]);

const editorialEntrySchema = z.object({
  id: z.string().min(1).max(180).optional(),
  targetType: targetTypeSchema,
  targetId: z.string().min(1).max(180),
  row: rowSchema,
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
  const snap = await db
    .collection(COLLECTION)
    .where("row", "==", input.row)
    .where("slot", "==", input.slot)
    .where("isActive", "==", true)
    .limit(10)
    .get();
  const collisions = snap.docs.filter((docSnap) => docSnap.id !== input.id);
  if (collisions.length > 0) {
    throw new HttpsError("failed-precondition", "Editorial slot collision.");
  }
}

async function assertOccupancy(input: EditorialInput): Promise<void> {
  if (!input.isActive) return;
  const now = Timestamp.now();
  const snap = await db
    .collection(COLLECTION)
    .where("row", "==", input.row)
    .where("isActive", "==", true)
    .limit(maxSlots(input.row) + 4)
    .get();
  const active = snap.docs.filter((docSnap) => {
    if (docSnap.id === input.id) return false;
    const endAt = docSnap.get("endAt");
    return endAt instanceof Timestamp && endAt.toMillis() > now.toMillis();
  });
  if (active.length >= maxSlots(input.row)) {
    throw new HttpsError("failed-precondition", "Editorial occupancy limit exceeded.");
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

export const adminListHomeEditorialEntries = onCall({ cors: true }, async (request) => {
  assertRoleAtLeast(request, "superadmin");
  const snap = await db.collection(COLLECTION).orderBy("row", "asc").orderBy("slot", "asc").limit(100).get();
  return {
    entries: snap.docs.map((docSnap) => serializeDoc(docSnap)),
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
      entries: active,
    },
  };
});
