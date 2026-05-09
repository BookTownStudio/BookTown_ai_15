#!/usr/bin/env ts-node

import * as fs from "fs";
import * as path from "path";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldPath, getFirestore } from "firebase-admin/firestore";
import { normalizeCanonicalTradition } from "../src/library/ontology/bookOntology";

type CliArgs = Record<string, string | boolean>;

type ApprovedAuthorityEntry = {
  canonicalTitle: string;
  canonicalAuthor: string;
  approvedCanonicalTradition: string;
};

type FirestoreBookRecord = {
  bookId: string;
  title: string;
  author: string;
  key: string;
  ref: FirebaseFirestore.DocumentReference;
  existingCanonicalTradition: string;
  hasOntologyForm: boolean;
};

type CollisionRecord = {
  key: string;
  entries: string[];
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const entry = raw.slice(2);
    const eqIndex = entry.indexOf("=");
    if (eqIndex === -1) {
      args[entry] = true;
      continue;
    }
    args[entry.slice(0, eqIndex)] = entry.slice(eqIndex + 1);
  }
  return args;
}

function asBool(value: string | boolean | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  if (typeof value === "boolean") return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return fallback;
}

function asPositiveInt(
  value: string | boolean | undefined,
  fallback: number,
  max: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.trunc(parsed);
  if (normalized <= 0) return fallback;
  return Math.min(normalized, max);
}

function asNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeAuthorityKeyPart(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function buildAuthorityKey(title: string, author: string): string {
  return `${normalizeAuthorityKeyPart(title)}::${normalizeAuthorityKeyPart(author)}`;
}

function isValidApprovedTradition(value: string): boolean {
  return normalizeCanonicalTradition(value) === value;
}

function initializeAdmin(args: CliArgs): void {
  if (getApps().length > 0) return;

  const projectId =
    asNonEmptyString(args["project-id"]) ||
    asNonEmptyString(process.env.FIREBASE_PROJECT_ID) ||
    undefined;
  const serviceAccountArg =
    asNonEmptyString(args["service-account"]) ||
    asNonEmptyString(process.env.SERVICE_ACCOUNT_PATH);

  if (serviceAccountArg) {
    const serviceAccountPath = path.resolve(process.cwd(), serviceAccountArg);
    if (!fs.existsSync(serviceAccountPath)) {
      throw new Error(`Service account file was not found: ${serviceAccountPath}`);
    }
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
    initializeApp({
      credential: cert(serviceAccount),
      ...(projectId ? { projectId } : {}),
    });
    return;
  }

  initializeApp({
    credential: applicationDefault(),
    ...(projectId ? { projectId } : {}),
  });
}

function printUsage(): void {
  console.log(`
Usage:
  npx ts-node scripts/applyCanonicalTraditionAuthority.ts [options]

Options:
  --dry-run=true|false                Default: true
  --authority=<path>                  Optional authority JSON path
  --authority-file=<path>             Default: data/canonicalTraditionAuthority.v2.approved.json
  --page-size=<n>                     Default: 400, max: 450
  --max-pages=<n>                     Default: 100000
  --print-unmatched-firestore=true    Default: false
  --sample-limit=<n>                  Default: 50, max: 500
  --project-id=<id>                   Optional Firebase project id
  --service-account=<path>            Optional service account JSON path
  --help                              Show this help
`);
}

function readAuthorityFile(filePath: string): ApprovedAuthorityEntry[] {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(raw)) {
    throw new Error("Approved canonical tradition authority file must contain a JSON array.");
  }

  return raw.map((entry, index) => {
    const record = asRecord(entry);
    const canonicalTitle = asNonEmptyString(record?.canonicalTitle);
    const canonicalAuthor = asNonEmptyString(record?.canonicalAuthor);
    const approvedCanonicalTradition = asNonEmptyString(record?.approvedCanonicalTradition);

    if (!canonicalTitle || !canonicalAuthor || !approvedCanonicalTradition) {
      throw new Error(`Invalid approved authority entry at index ${index}.`);
    }
    if (!isValidApprovedTradition(approvedCanonicalTradition)) {
      throw new Error(
        `Invalid approvedCanonicalTradition "${approvedCanonicalTradition}" at index ${index}.`
      );
    }

    return {
      canonicalTitle,
      canonicalAuthor,
      approvedCanonicalTradition,
    };
  });
}

function resolveBookTitle(data: FirebaseFirestore.DocumentData): string {
  return (
    asNonEmptyString(data.canonicalTitle) ||
    asNonEmptyString(data.title) ||
    asNonEmptyString(data.titleEn)
  );
}

function resolveBookAuthor(data: FirebaseFirestore.DocumentData): string {
  return (
    asNonEmptyString(data.author) ||
    asNonEmptyString(data.authorEn) ||
    asNonEmptyString(data.authorName) ||
    asStringArray(data.authors)[0] ||
    asStringArray(data.authorNames)[0] ||
    ""
  );
}

function readExistingCanonicalTradition(data: FirebaseFirestore.DocumentData): string {
  const ontology = asRecord(data.ontology);
  return asNonEmptyString(ontology?.canonicalTradition);
}

function hasOntologyForm(data: FirebaseFirestore.DocumentData): boolean {
  const ontology = asRecord(data.ontology);
  return asNonEmptyString(ontology?.form).length > 0;
}

function indexApprovedEntries(entries: ApprovedAuthorityEntry[]): {
  authorityByKey: Map<string, ApprovedAuthorityEntry>;
  duplicateEditorialKeys: CollisionRecord[];
} {
  const grouped = new Map<string, ApprovedAuthorityEntry[]>();
  for (const entry of entries) {
    const key = buildAuthorityKey(entry.canonicalTitle, entry.canonicalAuthor);
    grouped.set(key, [...(grouped.get(key) || []), entry]);
  }

  const authorityByKey = new Map<string, ApprovedAuthorityEntry>();
  const duplicateEditorialKeys: CollisionRecord[] = [];
  for (const [key, group] of grouped.entries()) {
    if (group.length > 1) {
      duplicateEditorialKeys.push({
        key,
        entries: group.map(
          (entry) =>
            `${entry.canonicalTitle} | ${entry.canonicalAuthor} | ${entry.approvedCanonicalTradition}`
        ),
      });
      continue;
    }
    authorityByKey.set(key, group[0]);
  }

  return {
    authorityByKey,
    duplicateEditorialKeys,
  };
}

async function loadFirestoreBooks(params: {
  pageSize: number;
  maxPages: number;
}): Promise<{
  booksByKey: Map<string, FirestoreBookRecord>;
  duplicateFirestoreKeys: CollisionRecord[];
  allBooks: FirestoreBookRecord[];
}> {
  const db = getFirestore();
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let pages = 0;
  const grouped = new Map<string, FirestoreBookRecord[]>();
  const allBooks: FirestoreBookRecord[] = [];

  while (pages < params.maxPages) {
    pages += 1;
    let query: FirebaseFirestore.Query = db
      .collection("books")
      .orderBy(FieldPath.documentId())
      .limit(params.pageSize);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const data = doc.data();
      const title = resolveBookTitle(data);
      const author = resolveBookAuthor(data);
      const key = buildAuthorityKey(title, author);
      const record: FirestoreBookRecord = {
        bookId: doc.id,
        title,
        author,
        key,
        ref: doc.ref,
        existingCanonicalTradition: readExistingCanonicalTradition(data),
        hasOntologyForm: hasOntologyForm(data),
      };
      allBooks.push(record);
      if (title && author) {
        grouped.set(key, [...(grouped.get(key) || []), record]);
      }
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < params.pageSize) break;
  }

  const booksByKey = new Map<string, FirestoreBookRecord>();
  const duplicateFirestoreKeys: CollisionRecord[] = [];
  for (const [key, group] of grouped.entries()) {
    if (group.length > 1) {
      duplicateFirestoreKeys.push({
        key,
        entries: group.map((book) => `${book.bookId} | ${book.title} | ${book.author}`),
      });
      continue;
    }
    booksByKey.set(key, group[0]);
  }

  return {
    booksByKey,
    duplicateFirestoreKeys,
    allBooks,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === true || args.help === "true") {
    printUsage();
    return;
  }

  const dryRun = asBool(args["dry-run"], true);
  const pageSize = asPositiveInt(args["page-size"], 400, 450);
  const maxPages = asPositiveInt(args["max-pages"], 100000, 1000000);
  const sampleLimit = asPositiveInt(args["sample-limit"], 50, 500);
  const printUnmatchedFirestore = asBool(args["print-unmatched-firestore"], false);
  const authorityPathArg =
    asNonEmptyString(args["authority"]) || asNonEmptyString(args["authority-file"]);
  const authorityFile = path.resolve(
    process.cwd(),
    authorityPathArg || path.join("data", "canonicalTraditionAuthority.v2.approved.json")
  );

  if (!fs.existsSync(authorityFile)) {
    throw new Error(`Approved authority file was not found: ${authorityFile}`);
  }

  const approvedEntries = readAuthorityFile(authorityFile);
  const { authorityByKey, duplicateEditorialKeys } = indexApprovedEntries(approvedEntries);
  if (duplicateEditorialKeys.length > 0) {
    console.error(
      "[CANONICAL_TRADITION_APPLY][EDITORIAL_DUPLICATE_COLLISIONS]",
      JSON.stringify(duplicateEditorialKeys.slice(0, sampleLimit), null, 2)
    );
    throw new Error("Duplicate editorial normalized keys detected. Refusing to continue.");
  }

  initializeAdmin(args);
  const db = getFirestore();
  const { booksByKey, duplicateFirestoreKeys, allBooks } = await loadFirestoreBooks({
    pageSize,
    maxPages,
  });
  const duplicateFirestoreKeySet = new Set(duplicateFirestoreKeys.map((entry) => entry.key));

  const unmatchedEditorial: string[] = [];
  const unmatchedFirestore: string[] = [];
  const skippedDuplicateFirestore: string[] = [];
  const skippedMissingOntologyForm: string[] = [];
  const matchedBookIds = new Set<string>();
  const matchedFirestoreKeys = new Set<string>();
  const writes: Array<{
    book: FirestoreBookRecord;
    authority: ApprovedAuthorityEntry;
  }> = [];
  let alreadyUpToDate = 0;

  for (const entry of authorityByKey.values()) {
    const key = buildAuthorityKey(entry.canonicalTitle, entry.canonicalAuthor);
    if (duplicateFirestoreKeySet.has(key)) {
      skippedDuplicateFirestore.push(`${entry.canonicalTitle} | ${entry.canonicalAuthor}`);
      continue;
    }

    const book = booksByKey.get(key);
    if (!book) {
      unmatchedEditorial.push(`${entry.canonicalTitle} | ${entry.canonicalAuthor}`);
      continue;
    }

    matchedBookIds.add(book.bookId);
    matchedFirestoreKeys.add(book.key);

    if (!book.hasOntologyForm) {
      skippedMissingOntologyForm.push(`${book.bookId} | ${book.title} | ${book.author}`);
      continue;
    }

    if (book.existingCanonicalTradition === entry.approvedCanonicalTradition) {
      alreadyUpToDate += 1;
      continue;
    }

    writes.push({
      book,
      authority: entry,
    });
  }

  if (printUnmatchedFirestore) {
    for (const book of allBooks) {
      if (!matchedFirestoreKeys.has(book.key)) {
        unmatchedFirestore.push(`${book.bookId} | ${book.title} | ${book.author}`);
      }
    }
  }

  let committedWrites = 0;
  let committedBatches = 0;
  if (!dryRun) {
    let batch = db.batch();
    let pending = 0;
    for (const write of writes) {
      batch.update(write.book.ref, {
        "ontology.canonicalTradition": write.authority.approvedCanonicalTradition,
      });
      pending += 1;

      if (pending >= 450) {
        await batch.commit();
        committedWrites += pending;
        committedBatches += 1;
        batch = db.batch();
        pending = 0;
      }
    }
    if (pending > 0) {
      await batch.commit();
      committedWrites += pending;
      committedBatches += 1;
    }
  }

  console.log(
    "[CANONICAL_TRADITION_APPLY][SUMMARY]",
    JSON.stringify(
      {
        dryRun,
        authorityFile,
        approvedEntries: approvedEntries.length,
        firestoreBooksScanned: allBooks.length,
        matchedBooks: matchedBookIds.size,
        alreadyUpToDate,
        wouldWrite: writes.length,
        committedWrites,
        committedBatches,
        unmatchedEditorialCount: unmatchedEditorial.length,
        duplicateFirestoreKeyCount: duplicateFirestoreKeys.length,
        skippedDuplicateFirestoreCount: skippedDuplicateFirestore.length,
        skippedMissingOntologyFormCount: skippedMissingOntologyForm.length,
        unmatchedFirestoreCount: unmatchedFirestore.length,
      },
      null,
      2
    )
  );

  if (unmatchedEditorial.length > 0) {
    console.log(
      "[CANONICAL_TRADITION_APPLY][UNMATCHED_EDITORIAL]",
      JSON.stringify(unmatchedEditorial.slice(0, sampleLimit), null, 2)
    );
  }

  if (duplicateFirestoreKeys.length > 0) {
    console.log(
      "[CANONICAL_TRADITION_APPLY][DUPLICATE_FIRESTORE_KEYS]",
      JSON.stringify(duplicateFirestoreKeys.slice(0, sampleLimit), null, 2)
    );
  }

  if (skippedMissingOntologyForm.length > 0) {
    console.log(
      "[CANONICAL_TRADITION_APPLY][SKIPPED_MISSING_ONTOLOGY_FORM]",
      JSON.stringify(skippedMissingOntologyForm.slice(0, sampleLimit), null, 2)
    );
  }

  if (printUnmatchedFirestore && unmatchedFirestore.length > 0) {
    console.log(
      "[CANONICAL_TRADITION_APPLY][UNMATCHED_FIRESTORE]",
      JSON.stringify(unmatchedFirestore.slice(0, sampleLimit), null, 2)
    );
  }
}

main().catch((error) => {
  console.error("[CANONICAL_TRADITION_APPLY][FAIL]", error);
  process.exitCode = 1;
});
