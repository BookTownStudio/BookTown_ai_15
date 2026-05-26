import { FieldValue } from "firebase-admin/firestore";

import { admin } from "../src/firebaseAdmin";
import {
  materializeBookAuthority,
  materializeBookAuthorityInTransaction,
} from "../src/library/materializeBookAuthority";
import { fetchOpenLibraryCanonicalMetadata } from "../src/library/providers/openLibrary";
import {
  buildSearchFieldsFromTextParts,
  normalizeSearchText,
} from "../src/search/normalization";

type Classification = "recoverable_provider" | "recoverable_release" | "invalid";

type ClassifiedAttachment = {
  id: string;
  classification: Classification;
  reason: string;
  bookId: string;
  editionId: string;
  releaseId: string;
  provider: string;
  providerExternalId: string;
  storagePath: string;
  mimeType: string;
  format: string;
};

type Summary = {
  scanned: number;
  recoverableProvider: number;
  recoverableRelease: number;
  invalid: number;
  recoveredCatalog: number;
  quarantined: number;
  readerAuthorityProjected: number;
  skippedAlreadyLinked: number;
  dryRun: boolean;
};

const db = admin.firestore();

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown, max = 2048): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function asPositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return null;
  return value;
}

function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const body = arg.slice(2);
    const index = body.indexOf("=");
    if (index === -1) args.set(body, "true");
    else args.set(body.slice(0, index), body.slice(index + 1));
  }
  return args;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Invalid boolean ${value}`);
}

function deriveBookId(ownerUid: string, projectId: string): string {
  return `write_${ownerUid}_${projectId}`;
}

function deriveEditionId(ownerUid: string, projectId: string): string {
  return `edition_write_${ownerUid}_${projectId}`;
}

function deriveSynopsis(normalizedContent: unknown): string {
  const content = asRecord(normalizedContent);
  const units = Array.isArray(content?.units) ? content.units : [];
  const text: string[] = [];
  const visit = (node: unknown): void => {
    const record = asRecord(node);
    if (!record) return;
    const nodeText = asString(record.text, 2000);
    if (nodeText) text.push(nodeText);
    const children = Array.isArray(record.content) ? record.content : [];
    children.forEach(visit);
  };
  units.forEach((unit) => {
    const unitRecord = asRecord(unit);
    const blocks = Array.isArray(unitRecord?.content) ? unitRecord.content : [];
    blocks.forEach(visit);
  });
  return text.join(" ").replace(/\s+/g, " ").trim().slice(0, 180);
}

function readerAuthority(attachmentId: string, source: "ebook_attachment" | "acquisition") {
  return {
    hasReadableAttachment: true,
    attachmentId,
    source,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

async function classifyAttachment(doc: FirebaseFirestore.QueryDocumentSnapshot): Promise<ClassifiedAttachment | null> {
  const data = doc.data();
  if (asString(data.type) !== "ebook") return null;
  if (asString(data.status) !== "active") return null;
  const storagePath = asString(data.storagePath);
  if (!storagePath) return null;

  const bookId = asString(data.bookId);
  const parentType = asString(data.parentType);
  const parentId = asString(data.parentId);
  const editionId = parentType === "editions" ? parentId : asString(data.editionId) || "";
  const bookSnap = bookId ? await db.collection("books").doc(bookId).get() : null;
  const editionSnap = editionId ? await db.collection("editions").doc(editionId).get() : null;
  if (bookSnap?.exists && editionSnap?.exists) return null;

  const provider = asString(data.sourceProvider);
  const providerExternalId = asString(data.sourceExternalId);
  if (provider && providerExternalId) {
    return {
      id: doc.id,
      classification: "invalid",
      reason: `${provider} attachment cannot restore the original book id through materializeBookAuthority`,
      bookId,
      editionId,
      releaseId: "",
      provider,
      providerExternalId,
      storagePath,
      mimeType: asString(data.mimeType) || "application/epub+zip",
      format: asString(data.format) || "epub",
    };
  }

  const releaseId =
    asString(data.releaseId) ||
    (doc.id.startsWith("att_release_") ? doc.id.slice("att_release_".length) : "");
  if (releaseId) {
    const releaseSnap = await db.collection("project_releases").doc(releaseId).get();
    if (releaseSnap.exists) {
      const release = releaseSnap.data() ?? {};
      const ownerUid = asString(release.ownerUid);
      const projectId = asString(release.projectId);
      if (ownerUid && projectId) {
        return {
          id: doc.id,
          classification: "recoverable_release",
          reason: "project_releases source exists",
          bookId: bookId || deriveBookId(ownerUid, projectId),
          editionId: editionId || deriveEditionId(ownerUid, projectId),
          releaseId,
          provider: "",
          providerExternalId: "",
          storagePath,
          mimeType: asString(data.mimeType) || "application/epub+zip",
          format: asString(data.format) || "epub",
        };
      }
    }
  }

  return {
    id: doc.id,
    classification: "invalid",
    reason: provider === "gutenberg"
      ? "gutenberg is ebook_source_only and cannot restore canonical catalog identity"
      : "missing supported materialization source",
    bookId,
    editionId,
    releaseId,
    provider,
    providerExternalId,
    storagePath,
    mimeType: asString(data.mimeType) || "application/epub+zip",
    format: asString(data.format) || "epub",
  };
}

async function recoverProvider(entry: ClassifiedAttachment, dryRun: boolean): Promise<void> {
  const rawBook = await fetchOpenLibraryCanonicalMetadata(entry.providerExternalId);
  if (!rawBook) throw new Error(`Unable to fetch OpenLibrary metadata for ${entry.providerExternalId}`);
  if (dryRun) return;

  const result = await materializeBookAuthority({
    source: "openLibrary",
    authorityStatus: "provisional",
    preferredBookId: entry.bookId,
    providerExternalId: entry.providerExternalId,
    rawBook,
    createEdition: true,
    ingestionKey: `openLibrary:${entry.providerExternalId}`,
  });

  if (result.bookId !== entry.bookId) {
    throw new Error(`Materialized bookId ${result.bookId} did not match attachment bookId ${entry.bookId}`);
  }

  const now = FieldValue.serverTimestamp();
  const providerRef = `${entry.provider}:${entry.providerExternalId}`;
  await db.runTransaction(async (tx) => {
    tx.set(db.collection("attachments").doc(entry.id), {
      parentType: "editions",
      parentId: entry.editionId,
      editionId: entry.editionId,
      bookId: entry.bookId,
      status: "active",
      updatedAt: now,
    }, { merge: true });
    tx.set(db.collection("books").doc(entry.bookId), {
      ebookAttachmentId: entry.id,
      ebookStoragePath: entry.storagePath,
      ...(entry.format === "epub" ? { epubStoragePath: entry.storagePath } : {}),
      acquiredFromProvider: entry.provider,
      providerExternalIds: FieldValue.arrayUnion(providerRef),
      externalReadableSources: [{
        provider: entry.provider,
        providerExternalId: entry.providerExternalId,
        trust: {
          availabilityTrust: true,
          acquisitionTrust: true,
        },
      }],
      readerAuthority: readerAuthority(entry.id, "acquisition"),
      updatedAt: now,
    }, { merge: true });
    tx.set(db.collection("editions").doc(entry.editionId), {
      editionId: entry.editionId,
      bookId: entry.bookId,
      ebookAttachmentId: entry.id,
      ebookStoragePath: entry.storagePath,
      ...(entry.format === "epub" ? { epubStoragePath: entry.storagePath } : {}),
      providerExternalIds: FieldValue.arrayUnion(providerRef),
      externalReadableSources: [{
        provider: entry.provider,
        providerExternalId: entry.providerExternalId,
        trust: {
          availabilityTrust: true,
          acquisitionTrust: true,
        },
      }],
      updatedAt: now,
    }, { merge: true });
  });
}

async function recoverRelease(entry: ClassifiedAttachment, dryRun: boolean): Promise<void> {
  const releaseSnap = await db.collection("project_releases").doc(entry.releaseId).get();
  if (!releaseSnap.exists) throw new Error(`Missing release ${entry.releaseId}`);
  const release = releaseSnap.data() ?? {};
  const ownerUid = asString(release.ownerUid);
  const projectId = asString(release.projectId);
  const title = asString(release.title) || "Untitled";
  const authorName = asString(release.authorDisplayName) || "Unknown";
  const language = asString(release.language, 16) || "en";
  const bookId = deriveBookId(ownerUid, projectId);
  const editionId = deriveEditionId(ownerUid, projectId);
  if (entry.bookId && entry.bookId !== bookId) {
    throw new Error(`Release ${entry.releaseId} derived bookId ${bookId} does not match ${entry.bookId}`);
  }
  if (entry.editionId && entry.editionId !== editionId) {
    throw new Error(`Release ${entry.releaseId} derived editionId ${editionId} does not match ${entry.editionId}`);
  }
  if (dryRun) return;

  const synopsis = deriveSynopsis(release.normalizedContent);
  const titleEn = language === "ar" ? "" : title;
  const titleAr = language === "ar" ? title : "";
  const searchFields = buildSearchFieldsFromTextParts([title, titleEn, titleAr, authorName]);
  const normalizedTitle = normalizeSearchText(titleEn || titleAr || title);
  const normalizedAuthor = normalizeSearchText(authorName);
  const now = FieldValue.serverTimestamp();
  const publicationVersion = asPositiveInt(release.version) || 1;

  await db.runTransaction(async (tx) => {
    await materializeBookAuthorityInTransaction({
      source: "write_release",
      authorityStatus: "provisional",
      preferredBookId: bookId,
      allowIdentityReuse: false,
      createEdition: false,
      ingestionKey: `write_release:${ownerUid}:${projectId}`,
      extraIdentityKeys: [`source:write_release:${ownerUid}:${projectId}`],
      rawBook: {
        id: bookId,
        bookId,
        title,
        titleEn,
        titleAr,
        author: authorName,
        authorEn: authorName,
        authorAr: authorName,
        authors: [authorName],
        description: synopsis,
        descriptionEn: synopsis,
        descriptionAr: synopsis,
        language,
        source: "write_release",
        ownerId: ownerUid,
        ownerUid,
        projectId,
        rightsMode: "public_free",
        visibility: "public",
        publicationState: "published",
      },
      tx,
    });

    tx.set(db.collection("attachments").doc(entry.id), {
      parentType: "editions",
      parentId: editionId,
      editionId,
      bookId,
      releaseId: entry.releaseId,
      status: "active",
      updatedAt: now,
    }, { merge: true });
    tx.set(db.collection("editions").doc(editionId), {
      id: editionId,
      editionId,
      bookId,
      source: "write_release",
      externalId: projectId,
      title,
      titleEn,
      titleAr,
      authors: [authorName],
      authorEn: authorName,
      authorAr: authorName,
      language,
      description: synopsis,
      descriptionEn: synopsis,
      descriptionAr: synopsis,
      searchTitleNormalized: normalizedTitle,
      searchAuthorNormalized: normalizedAuthor,
      searchTokens: searchFields.tokens,
      currentReleaseId: entry.releaseId,
      ebookAttachmentId: entry.id,
      epubStoragePath: entry.storagePath,
      publicationVersion,
      lastPublishedTarget: "ebook",
      publicationState: "published",
      rightsMode: "public_free",
      visibility: "public",
      updatedAt: now,
    }, { merge: true });
    tx.set(db.collection("books").doc(bookId), {
      editionId,
      projectId,
      ownerId: ownerUid,
      ownerUid,
      authorDisplayName: authorName,
      ownerDisplayName: authorName,
      bookType: "authored_native",
      synopsis,
      ebookAttachmentId: entry.id,
      epubStoragePath: entry.storagePath,
      currentReleaseId: entry.releaseId,
      publicationVersion,
      lastPublishedTarget: "ebook",
      publicationState: "published",
      rightsMode: "public_free",
      visibility: "public",
      readerAuthority: readerAuthority(entry.id, "ebook_attachment"),
      updatedAt: now,
    }, { merge: true });
  });
}

async function quarantine(entry: ClassifiedAttachment, dryRun: boolean): Promise<void> {
  if (dryRun) return;
  await db.collection("attachments").doc(entry.id).set({
    status: "orphaned",
    readerEligible: false,
    orphanedReason: entry.reason,
    orphanedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = parseBool(args.get("dry-run") ?? args.get("dryRun"), true);
  const attachmentSnap = await db.collection("attachments").where("type", "==", "ebook").get();
  const summary: Summary = {
    scanned: 0,
    recoverableProvider: 0,
    recoverableRelease: 0,
    invalid: 0,
    recoveredCatalog: 0,
    quarantined: 0,
    readerAuthorityProjected: 0,
    skippedAlreadyLinked: 0,
    dryRun,
  };
  const classified: ClassifiedAttachment[] = [];

  for (const doc of attachmentSnap.docs) {
    summary.scanned += 1;
    const entry = await classifyAttachment(doc);
    if (!entry) {
      summary.skippedAlreadyLinked += 1;
      continue;
    }
    classified.push(entry);
    if (entry.classification === "recoverable_provider") summary.recoverableProvider += 1;
    if (entry.classification === "recoverable_release") summary.recoverableRelease += 1;
    if (entry.classification === "invalid") summary.invalid += 1;
  }

  console.log("[CATALOG_ATTACHMENT_RECONCILE][CLASSIFICATION]", {
    summary,
    classified,
  });

  for (const entry of classified) {
    if (entry.classification === "recoverable_provider") {
      await recoverProvider(entry, dryRun);
      summary.recoveredCatalog += 1;
      summary.readerAuthorityProjected += 1;
    } else if (entry.classification === "recoverable_release") {
      await recoverRelease(entry, dryRun);
      summary.recoveredCatalog += 1;
      summary.readerAuthorityProjected += 1;
    } else {
      await quarantine(entry, dryRun);
      summary.quarantined += 1;
    }
  }

  console.log("[CATALOG_ATTACHMENT_RECONCILE][SUMMARY]", summary);
}

main().catch((error) => {
  console.error("[CATALOG_ATTACHMENT_RECONCILE][FAILED]", error);
  process.exitCode = 1;
});
