import { admin } from "../firebaseAdmin";

type LiteraryAuthorityClass = "classic_work";

type ScriptOptions = {
  dryRun: boolean;
};

const TARGET_TITLES = [
  "The Trial",
  "The Plague",
  "The Metamorphosis",
  "The Stranger",
  "The Idiot",
  "Crime and Punishment",
] as const;

const TARGET_AUTHORITY_CLASS: LiteraryAuthorityClass = "classic_work";
const MAX_BATCH_WRITES = 450;

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asNonEmptyString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function parseDryRun(argv: string[]): boolean {
  const flag = argv.find((entry) => entry.startsWith("--dry-run="));
  if (!flag) return true;
  return flag.split("=")[1] !== "false";
}

function resolveTitleAuthorities(data: FirebaseFirestore.DocumentData): string[] {
  return Array.from(
    new Set(
      [
        asNonEmptyString(data.title),
        asNonEmptyString(data.titleEn),
        asNonEmptyString(data.titleAr),
        ...asStringArray(data.aliases),
        ...asStringArray(data.titleAliases),
        ...asStringArray(data.alternateTitles),
        ...asStringArray(data.otherTitles),
      ].filter((entry): entry is string => Boolean(entry))
    )
  );
}

function matchesTargetTitle(
  data: FirebaseFirestore.DocumentData,
  normalizedTarget: string
): boolean {
  const canonicalAuthorities = asStringArray(data.canonicalTitleAuthorities);
  if (canonicalAuthorities.includes(normalizedTarget)) {
    return true;
  }

  const normalizedTitle = asNonEmptyString(data.normalizedTitle);
  if (normalizedTitle === normalizedTarget) {
    return true;
  }

  return resolveTitleAuthorities(data).some(
    (title) => normalizeTitle(title) === normalizedTarget
  );
}

async function fetchCandidateDocsForTitle(
  books: FirebaseFirestore.CollectionReference,
  targetTitle: string
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const normalizedTarget = normalizeTitle(targetTitle);
  const snapshots = await Promise.all([
    books.where("title", "==", targetTitle).get(),
    books.where("titleEn", "==", targetTitle).get(),
    books.where("normalizedTitle", "==", normalizedTarget).get(),
    books.where("canonicalTitleAuthorities", "array-contains", normalizedTarget).get(),
  ]);

  const dedup = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const snap of snapshots) {
    for (const doc of snap.docs) {
      dedup.set(doc.id, doc);
    }
  }
  return Array.from(dedup.values());
}

async function run(options: ScriptOptions): Promise<void> {
  const db = admin.firestore();
  const books = db.collection("books");
  let batch = db.batch();
  let pendingWrites = 0;
  let updatedCount = 0;
  let unchangedCount = 0;

  for (const targetTitle of TARGET_TITLES) {
    const normalizedTarget = normalizeTitle(targetTitle);
    const candidates = await fetchCandidateDocsForTitle(books, targetTitle);
    const exactMatches = candidates.filter((doc) =>
      matchesTargetTitle(doc.data(), normalizedTarget)
    );

    console.log(
      `[literary-authority][${options.dryRun ? "dry-run" : "write"}] title="${targetTitle}" candidates=${candidates.length} exactMatches=${exactMatches.length}`
    );

    if (exactMatches.length === 0) {
      console.log(
        `[literary-authority][warn] no exact canonical books match found for "${targetTitle}"`
      );
      continue;
    }

    for (const doc of exactMatches) {
      const currentClass = asNonEmptyString(doc.get("literaryAuthorityClass"));
      if (currentClass === TARGET_AUTHORITY_CLASS) {
        unchangedCount += 1;
        console.log(
          `[literary-authority][skip] ${doc.id} already literaryAuthorityClass=${TARGET_AUTHORITY_CLASS}`
        );
        continue;
      }

      console.log(
        `[literary-authority][update] ${doc.id} => literaryAuthorityClass=${TARGET_AUTHORITY_CLASS}`
      );

      if (!options.dryRun) {
        batch.set(
          doc.ref,
          { literaryAuthorityClass: TARGET_AUTHORITY_CLASS },
          { merge: true }
        );
        pendingWrites += 1;
      }
      updatedCount += 1;

      if (!options.dryRun && pendingWrites >= MAX_BATCH_WRITES) {
        console.log(
          `[literary-authority][commit] committing ${pendingWrites} updates`
        );
        await batch.commit();
        batch = db.batch();
        pendingWrites = 0;
      }
    }
  }

  if (!options.dryRun && pendingWrites > 0) {
    console.log(`[literary-authority][commit] committing ${pendingWrites} updates`);
    await batch.commit();
  }

  console.log(
    `[literary-authority][done] dryRun=${options.dryRun} updated=${updatedCount} unchanged=${unchangedCount}`
  );
}

const options: ScriptOptions = {
  dryRun: parseDryRun(process.argv.slice(2)),
};

run(options).catch((error) => {
  console.error("[literary-authority][fatal]", error);
  process.exitCode = 1;
});
