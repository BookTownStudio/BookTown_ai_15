import * as logger from "firebase-functions/logger";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";
import { admin } from "../firebaseAdmin";
import { assertRoleAtLeast } from "../control/assertRole";
import { buildCatalogBookView, isPublicReadableBook } from "../catalog/catalogBookView";
import { resolveBookToEbookAttachment } from "../attachments/resolveBookToEbookAttachment";

const db = admin.firestore();
const COLLECTION = "continuityStarterPool";
const SELECTION_COLLECTION = "home_starter_selections";

export const STARTER_POOL_AUTHORITY = "continuity_starter_pool_v1";

const starterLanguageSchema = z.enum(["en", "ar", "fr", "es"]);
const starterStatusSchema = z.enum(["placeholder", "canonical_linked", "readable", "paused"]);

const starterPoolUpdateSchema = z.object({
  id: z.string().min(1).max(180),
  active: z.boolean().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  onboardingWeight: z.number().min(0).max(10).optional(),
  notes: z.string().max(500).optional(),
  canonicalBookId: z.string().min(1).max(180).nullable().optional(),
  status: starterStatusSchema.optional(),
});

export type ContinuityStarterPoolRecord = {
  id: string;
  title: string;
  author: string;
  language: z.infer<typeof starterLanguageSchema>;
  futureCanonicalKey: string;
  canonicalBookId: string | null;
  status: z.infer<typeof starterStatusSchema>;
  active: boolean;
  priority: number;
  onboardingWeight: number;
  notes: string;
  createdAt: string | null;
  updatedAt: string | null;
};

type StarterSeed = Omit<ContinuityStarterPoolRecord, "createdAt" | "updatedAt" | "canonicalBookId" | "status" | "active" | "notes"> & {
  notes: string;
};

type StarterSelection =
  | {
      kind: "canonical";
      authority: typeof STARTER_POOL_AUTHORITY;
      starter: ContinuityStarterPoolRecord;
      book: Record<string, unknown>;
    }
  | {
      kind: "placeholder";
      authority: typeof STARTER_POOL_AUTHORITY;
      starter: ContinuityStarterPoolRecord;
      book: null;
    };

const DEFAULT_STARTERS: StarterSeed[] = [
  starter("the-happy-prince-and-other-tales-oscar-wilde-en", "The Happy Prince and Other Tales", "Oscar Wilde", "en", 10, 1),
  starter("alices-adventures-in-wonderland-lewis-carroll-en", "Alice's Adventures in Wonderland", "Lewis Carroll", "en", 20, 1),
  starter("white-nights-fyodor-dostoevsky-en", "White Nights", "Fyodor Dostoevsky", "en", 30, 1),
  starter("the-time-machine-h-g-wells-en", "The Time Machine", "H.G. Wells", "en", 40, 1),
  starter("al-ajniha-al-mutakassira-gibran-khalil-gibran-ar", "الأجنحة المتكسرة", "جبران خليل جبران", "ar", 10, 1),
  starter("al-bahr-wal-ghurub-yukio-mishima-ar", "البحر والغروب وقصص أخرى", "يوكيو ميشيما", "ar", 20, 1),
  starter("hikaya-bila-bidaya-wala-nihaya-naguib-mahfouz-ar", "حكاية بلا بداية ولا نهاية", "نجيب محفوظ", "ar", 30, 1),
  starter("beirut-beirut-sonallah-ibrahim-ar", "بيروت بيروت", "صنع الله إبراهيم", "ar", 40, 1),
  starter("le-petit-prince-antoine-de-saint-exupery-fr", "Le Petit Prince", "Antoine de Saint-Exupéry", "fr", 10, 1),
  starter("platero-y-yo-juan-ramon-jimenez-es", "Platero y yo", "Juan Ramón Jiménez", "es", 10, 1),
];

function starter(
  id: string,
  title: string,
  author: string,
  language: z.infer<typeof starterLanguageSchema>,
  priority: number,
  onboardingWeight: number
): StarterSeed {
  return {
    id,
    title,
    author,
    language,
    futureCanonicalKey: `${language}:${title}:${author}`.toLowerCase(),
    priority,
    onboardingWeight,
    notes: "Calm continuity doorway. Must resolve through materializeBookAuthority before reader launch.",
  };
}

function asString(value: unknown, maxLen = 300): string {
  return typeof value === "string" ? value.trim().slice(0, maxLen) : "";
}

function timestampToIso(value: unknown): string | null {
  if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
  return null;
}

function deterministicIndex(seed: string, size: number): number {
  if (size <= 1) return 0;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % size;
}

function daySeed(): string {
  return new Date().toISOString().slice(0, 10);
}

function serializeStarter(id: string, data: Record<string, unknown>): ContinuityStarterPoolRecord {
  const parsedLanguage = starterLanguageSchema.safeParse(asString(data.language, 8));
  const parsedStatus = starterStatusSchema.safeParse(asString(data.status, 32));
  return {
    id,
    title: asString(data.title) || "Untitled starter",
    author: asString(data.author) || "Unknown author",
    language: parsedLanguage.success ? parsedLanguage.data : "en",
    futureCanonicalKey: asString(data.futureCanonicalKey, 500) || id,
    canonicalBookId: asString(data.canonicalBookId, 180) || null,
    status: parsedStatus.success ? parsedStatus.data : "placeholder",
    active: data.active !== false,
    priority: Number.isFinite(Number(data.priority)) ? Number(data.priority) : 100,
    onboardingWeight: Number.isFinite(Number(data.onboardingWeight)) ? Number(data.onboardingWeight) : 1,
    notes: asString(data.notes, 500),
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

export async function ensureContinuityStarterPool(): Promise<void> {
  const refs = DEFAULT_STARTERS.map((seed) => db.collection(COLLECTION).doc(seed.id));
  const snaps = await db.getAll(...refs);
  const batch = db.batch();
  let writes = 0;
  snaps.forEach((snap, index) => {
    if (snap.exists) return;
    const seed = DEFAULT_STARTERS[index];
    batch.set(snap.ref, {
      ...seed,
      canonicalBookId: null,
      status: "placeholder",
      active: true,
      authority: STARTER_POOL_AUTHORITY,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    writes += 1;
  });
  if (writes > 0) await batch.commit();
}

export async function listContinuityStarterPool(): Promise<ContinuityStarterPoolRecord[]> {
  await ensureContinuityStarterPool();
  const snap = await db.collection(COLLECTION).orderBy("language", "asc").orderBy("priority", "asc").limit(50).get();
  return snap.docs.map((doc) => serializeStarter(doc.id, (doc.data() ?? {}) as Record<string, unknown>));
}

async function canonicalBookIsReadable(bookId: string): Promise<{ readable: boolean; data: Record<string, unknown> | null }> {
  const snap = await db.collection("books").doc(bookId).get();
  if (!snap.exists) return { readable: false, data: null };
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  if (!isPublicReadableBook(data)) return { readable: false, data };
  const attachment = await resolveBookToEbookAttachment(bookId).catch(() => null);
  return { readable: Boolean(attachment?.storagePath), data };
}

export async function selectContinuityStarter(uid: string): Promise<StarterSelection> {
  const pool = (await listContinuityStarterPool())
    .filter((entry) => entry.active)
    .sort((left, right) => {
      if (left.priority !== right.priority) return left.priority - right.priority;
      return right.onboardingWeight - left.onboardingWeight;
    });

  if (pool.length === 0) {
    throw new HttpsError("unavailable", "No continuity starter doorway is configured.");
  }

  const selected = pool[deterministicIndex(`${uid}:starter:${daySeed()}`, pool.length)];
  const selectionBase = {
    uid,
    mode: "starter",
    starterId: selected.id,
    canonicalBookId: selected.canonicalBookId,
    authority: STARTER_POOL_AUTHORITY,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (selected.canonicalBookId) {
    const canonical = await canonicalBookIsReadable(selected.canonicalBookId);
    if (canonical.readable && canonical.data) {
      await db.collection(SELECTION_COLLECTION).add({
        ...selectionBase,
        kind: "canonical",
      }).catch((error) => {
        logger.warn("[HOME][STARTER_SELECTION_LOG_FAILED]", { uid, starterId: selected.id, error: String(error) });
      });
      return {
        kind: "canonical",
        authority: STARTER_POOL_AUTHORITY,
        starter: selected,
        book: await buildCatalogBookView(selected.canonicalBookId, canonical.data),
      };
    }
  }

  await db.collection(SELECTION_COLLECTION).add({
    ...selectionBase,
    kind: "placeholder",
  }).catch((error) => {
    logger.warn("[HOME][STARTER_SELECTION_LOG_FAILED]", { uid, starterId: selected.id, error: String(error) });
  });

  return {
    kind: "placeholder",
    authority: STARTER_POOL_AUTHORITY,
    starter: selected,
    book: null,
  };
}

export const adminListContinuityStarterPool = onCall({ cors: true }, async (request) => {
  assertRoleAtLeast(request, "superadmin");
  return {
    starters: await listContinuityStarterPool(),
  };
});

export const adminUpdateContinuityStarterPoolEntry = onCall({ cors: true }, async (request) => {
  const caller = assertRoleAtLeast(request, "superadmin");
  const parsed = starterPoolUpdateSchema.safeParse(request.data ?? {});
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "Invalid continuity starter update.");
  }
  await ensureContinuityStarterPool();
  const ref = db.collection(COLLECTION).doc(parsed.data.id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Continuity starter entry does not exist.");
  }
  const update: Record<string, unknown> = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: caller.uid,
  };
  if (typeof parsed.data.active === "boolean") update.active = parsed.data.active;
  if (typeof parsed.data.priority === "number") update.priority = parsed.data.priority;
  if (typeof parsed.data.onboardingWeight === "number") update.onboardingWeight = parsed.data.onboardingWeight;
  if (typeof parsed.data.notes === "string") update.notes = parsed.data.notes.trim();
  if (parsed.data.canonicalBookId !== undefined) {
    update.canonicalBookId = parsed.data.canonicalBookId?.trim() || admin.firestore.FieldValue.delete();
  }
  if (parsed.data.status) update.status = parsed.data.status;
  await ref.update(update);
  const updated = await ref.get();
  return {
    starter: serializeStarter(updated.id, (updated.data() ?? {}) as Record<string, unknown>),
  };
});
