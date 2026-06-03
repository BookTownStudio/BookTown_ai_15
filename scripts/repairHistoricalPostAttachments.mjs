import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootRequire = createRequire(path.resolve(__dirname, "../package.json"));
const {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} = rootRequire("firebase-admin/app");
const { FieldValue, getFirestore } = rootRequire("firebase-admin/firestore");

const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, "serviceAccountKey.json");
const DEFAULT_PROJECT_ID = "booktown-ai";
const DEFAULT_POST_LIMIT = 5000;
const WRITE_BATCH_LIMIT = 400;
const SAMPLE_LIMIT = 100;

function parseArgs(argv) {
  const args = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const body = arg.slice(2);
    const separatorIndex = body.indexOf("=");
    if (separatorIndex === -1) {
      args.set(body, "true");
      continue;
    }
    args.set(body.slice(0, separatorIndex), body.slice(separatorIndex + 1));
  }
  return args;
}

function parseBoolean(value, fallback) {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Invalid boolean value "${value}". Use true or false.`);
}

function parsePositiveInt(value, fallback) {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer "${value}".`);
  }
  return parsed;
}

function readString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toIso(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "string") return value;
  return null;
}

function extractAttachmentIds(post) {
  const attachments = Array.isArray(post.content?.attachments) ? post.content.attachments : [];
  const ids = [];
  for (const attachment of attachments) {
    const id =
      readString(attachment?.attachmentId) ||
      readString(attachment?.id) ||
      readString(attachment?.entityId);
    if (id) ids.push(id);
  }
  return Array.from(new Set(ids));
}

async function loadServiceAccount() {
  const raw = await fs.readFile(SERVICE_ACCOUNT_PATH, "utf8");
  return JSON.parse(raw);
}

async function initFirestore(projectId) {
  if (getApps().length === 0) {
    try {
      initializeApp({
        credential: cert(await loadServiceAccount()),
        projectId,
      });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      initializeApp({
        credential: applicationDefault(),
        projectId,
      });
    }
  }
  return getFirestore();
}

function resolveOptions(args) {
  return {
    projectId: readString(args.get("projectId") ?? args.get("project")) || DEFAULT_PROJECT_ID,
    dryRun: parseBoolean(args.get("dryRun") ?? args.get("dry-run"), true),
    postLimit: parsePositiveInt(args.get("postLimit"), DEFAULT_POST_LIMIT),
  };
}

function pushSample(list, value) {
  if (list.length < SAMPLE_LIMIT) list.push(value);
}

async function main() {
  const options = resolveOptions(parseArgs(process.argv.slice(2)));
  const db = await initFirestore(options.projectId);
  const summary = {
    projectId: options.projectId,
    dryRun: options.dryRun,
    scannedPublishedPosts: 0,
    scannedAttachmentReferences: 0,
    repairableAttachments: 0,
    repairedAttachments: 0,
    skippedAlreadyPostBound: 0,
    skippedUploaderMismatch: 0,
    skippedNonDraftParent: 0,
    skippedMissingAttachment: 0,
    skippedDuplicateConflict: 0,
    missingAttachmentReferences: [],
    repairSamples: [],
    skipSamples: [],
  };

  console.log("[HISTORICAL_POST_ATTACHMENT_REPAIR][START]", {
    projectId: options.projectId,
    dryRun: options.dryRun,
    postLimit: options.postLimit,
    serviceAccountPath: SERVICE_ACCOUNT_PATH,
  });

  const postsSnap = await db
    .collection("posts")
    .where("status", "==", "published")
    .limit(options.postLimit)
    .get();

  let pendingBatch = db.batch();
  let pendingWrites = 0;
  const plannedByAttachment = new Map();

  async function enqueueRepair(attachmentRef, patch) {
    if (options.dryRun) return;
    pendingBatch.set(attachmentRef, patch, { merge: true });
    pendingWrites += 1;
    if (pendingWrites >= WRITE_BATCH_LIMIT) {
      await pendingBatch.commit();
      pendingBatch = db.batch();
      pendingWrites = 0;
    }
  }

  for (const postSnap of postsSnap.docs) {
    const post = postSnap.data() || {};
    if (post.isDeleted === true || post.visibility !== "public") continue;
    summary.scannedPublishedPosts += 1;
    const attachmentIds = extractAttachmentIds(post);

    for (const attachmentId of attachmentIds) {
      summary.scannedAttachmentReferences += 1;
      if (plannedByAttachment.has(attachmentId)) {
        const existingPostId = plannedByAttachment.get(attachmentId);
        if (existingPostId !== postSnap.id) {
          summary.skippedDuplicateConflict += 1;
          pushSample(summary.skipSamples, {
            reason: "duplicate_attachment_reference_conflict",
            attachmentId,
            existingPostId,
            conflictingPostId: postSnap.id,
          });
        }
        continue;
      }

      const attachmentRef = db.collection("attachments").doc(attachmentId);
      const attachmentSnap = await attachmentRef.get();
      if (!attachmentSnap.exists) {
        summary.skippedMissingAttachment += 1;
        pushSample(summary.missingAttachmentReferences, {
          postId: postSnap.id,
          attachmentId,
          authorUid: readString(post.authorId) || null,
          createdAt: toIso(post.createdAt ?? post.timestamps?.createdAt),
        });
        continue;
      }

      const attachment = attachmentSnap.data() || {};
      const parentType = readString(attachment.parentType);
      const parentId = readString(attachment.parentId);
      const uploaderUid = readString(attachment.uploader?.uid);
      const authorUid = readString(post.authorId);

      if (parentType === "posts" && parentId === postSnap.id) {
        summary.skippedAlreadyPostBound += 1;
        continue;
      }

      if (parentType !== "drafts") {
        summary.skippedNonDraftParent += 1;
        pushSample(summary.skipSamples, {
          reason: "non_draft_parent",
          attachmentId,
          parentType,
          parentId,
          postId: postSnap.id,
        });
        continue;
      }

      if (!uploaderUid || uploaderUid !== authorUid) {
        summary.skippedUploaderMismatch += 1;
        pushSample(summary.skipSamples, {
          reason: "uploader_mismatch",
          attachmentId,
          postId: postSnap.id,
          uploaderUid: uploaderUid || null,
          authorUid: authorUid || null,
        });
        continue;
      }

      const metadata =
        attachment.metadata && typeof attachment.metadata === "object" && !Array.isArray(attachment.metadata)
          ? attachment.metadata
          : {};
      const patch = {
        parentType: "posts",
        parentId: postSnap.id,
        visibility: "public",
        updatedAt: FieldValue.serverTimestamp(),
        metadata: {
          ...metadata,
          parentType: "posts",
          parentId: postSnap.id,
        },
      };

      plannedByAttachment.set(attachmentId, postSnap.id);
      summary.repairableAttachments += 1;
      pushSample(summary.repairSamples, {
        attachmentId,
        postId: postSnap.id,
        previousParentType: parentType,
        previousParentId: parentId || null,
        previousVisibility: attachment.visibility ?? null,
        nextParentType: "posts",
        nextParentId: postSnap.id,
        nextVisibility: "public",
      });

      await enqueueRepair(attachmentRef, patch);
      if (!options.dryRun) summary.repairedAttachments += 1;
    }
  }

  if (!options.dryRun && pendingWrites > 0) {
    await pendingBatch.commit();
  }

  console.log("[HISTORICAL_POST_ATTACHMENT_REPAIR][SUMMARY]", summary);
}

main().catch((error) => {
  console.error("[HISTORICAL_POST_ATTACHMENT_REPAIR][FAILED]", error);
  process.exitCode = 1;
});
