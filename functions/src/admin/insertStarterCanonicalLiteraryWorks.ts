import { FieldValue } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import { buildBookSearchPatch } from "../library/search/searchIndexing";

type LiteraryAuthorityClass = "classic_work";

type StarterCanonicalWork = {
  title: string;
  author: string;
  language: string;
  literaryAuthorityClass: LiteraryAuthorityClass;
};

type ScriptOptions = {
  dryRun: boolean;
};

const STARTER_WORKS: StarterCanonicalWork[] = [
  {
    title: "The Idiot",
    author: "Fyodor Dostoevsky",
    language: "en",
    literaryAuthorityClass: "classic_work",
  },
  {
    title: "Crime and Punishment",
    author: "Fyodor Dostoevsky",
    language: "en",
    literaryAuthorityClass: "classic_work",
  },
  {
    title: "The Trial",
    author: "Franz Kafka",
    language: "en",
    literaryAuthorityClass: "classic_work",
  },
  {
    title: "The Plague",
    author: "Albert Camus",
    language: "en",
    literaryAuthorityClass: "classic_work",
  },
];

function asNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string): string {
  return normalizeText(value).replace(/\s+/g, "_");
}

function parseDryRun(argv: string[]): boolean {
  const flag = argv.find((entry) => entry.startsWith("--dry-run="));
  if (!flag) return true;
  return flag.split("=")[1] !== "false";
}

function buildCanonicalDocId(work: StarterCanonicalWork): string {
  return `canonical_${slugify(work.author)}_${slugify(work.title)}`;
}

function buildCanonicalKey(work: StarterCanonicalWork): string {
  return `${normalizeText(work.author)}::${normalizeText(work.title)}`;
}

function matchesExactStandaloneCanonicalDoc(
  data: FirebaseFirestore.DocumentData,
  work: StarterCanonicalWork
): boolean {
  const title = asNonEmptyString(data.title) || asNonEmptyString(data.titleEn);
  const author = asNonEmptyString(data.authorEn) || asNonEmptyString(data.author);
  return (
    normalizeText(title) === normalizeText(work.title) &&
    normalizeText(author) === normalizeText(work.author)
  );
}

async function findExistingExactCanonicalDocs(
  books: FirebaseFirestore.CollectionReference,
  work: StarterCanonicalWork
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const [titleSnap, titleEnSnap, keySnap] = await Promise.all([
    books.where("title", "==", work.title).get(),
    books.where("titleEn", "==", work.title).get(),
    books.where("canonicalKey", "==", buildCanonicalKey(work)).get(),
  ]);

  const dedup = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const snap of [titleSnap, titleEnSnap, keySnap]) {
    for (const doc of snap.docs) {
      if (matchesExactStandaloneCanonicalDoc(doc.data(), work)) {
        dedup.set(doc.id, doc);
      }
    }
  }
  return Array.from(dedup.values());
}

function buildStarterCanonicalPayload(
  docId: string,
  work: StarterCanonicalWork
): Record<string, unknown> {
  const now = FieldValue.serverTimestamp();
  const base: Record<string, unknown> = {
    id: docId,
    bookId: docId,
    source: "booktown_canonical",
    sourcePriority: "canonical",
    workType: "canonical",
    title: work.title,
    titleEn: work.title,
    titleAr: "",
    author: work.author,
    authorEn: work.author,
    authorAr: "",
    authors: [work.author],
    description: "",
    descriptionEn: "",
    descriptionAr: "",
    language: work.language,
    canonicalKey: buildCanonicalKey(work),
    literaryAuthorityClass: work.literaryAuthorityClass,
    rightsMode: "public_free",
    visibility: "public",
    publicationState: "published",
    canonicalLocked: true,
    hasEbook: false,
    downloadable: false,
    isEbookAvailable: false,
    createdAt: now,
    updatedAt: now,
  };

  return {
    ...base,
    ...buildBookSearchPatch(base),
  };
}

async function run(options: ScriptOptions): Promise<void> {
  const db = admin.firestore();
  const books = db.collection("books");
  let batch = db.batch();
  let pendingWrites = 0;

  for (const work of STARTER_WORKS) {
    const docId = buildCanonicalDocId(work);
    const targetRef = books.doc(docId);
    const [existingTargetSnap, existingExactDocs] = await Promise.all([
      targetRef.get(),
      findExistingExactCanonicalDocs(books, work),
    ]);

    if (existingTargetSnap.exists) {
      const existing = existingTargetSnap.data() ?? {};
      if (!matchesExactStandaloneCanonicalDoc(existing, work)) {
        throw new Error(
          `Refusing to overwrite non-matching existing doc ${docId} for ${work.title}`
        );
      }

      console.log(
        `[canonical-books][skip] ${docId} already exists for "${work.title}" by ${work.author}`
      );
      continue;
    }

    if (existingExactDocs.length > 0) {
      console.log(
        `[canonical-books][skip] exact standalone canonical doc already exists for "${work.title}" by ${work.author}: ${existingExactDocs
          .map((doc) => doc.id)
          .join(", ")}`
      );
      continue;
    }

    const payload = buildStarterCanonicalPayload(docId, work);
    console.log(
      `[canonical-books][${options.dryRun ? "dry-run" : "create"}] ${docId} => "${work.title}" by ${work.author}`
    );

    if (!options.dryRun) {
      batch.create(targetRef, payload);
      pendingWrites += 1;
    }
  }

  if (!options.dryRun && pendingWrites > 0) {
    console.log(`[canonical-books][commit] creating ${pendingWrites} canonical books docs`);
    await batch.commit();
    batch = db.batch();
  }

  console.log(`[canonical-books][done] dryRun=${options.dryRun}`);
}

const options: ScriptOptions = {
  dryRun: parseDryRun(process.argv.slice(2)),
};

run(options).catch((error) => {
  console.error("[canonical-books][fatal]", error);
  process.exitCode = 1;
});
