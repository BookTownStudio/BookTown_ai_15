import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { z } from "zod";

import { admin } from "../firebaseAdmin";
import { assertActiveAuthenticatedUser, assertRoleFromClaims } from "../shared/auth";
import { materializeBookAuthority } from "./materializeBookAuthority";
import { BOOKTOWN_REFINERY_PROVIDER_ID } from "./providers/booktownRefinery";

const MAX_ARTIFACTS_PER_REQUEST = 50;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;

const forbiddenOwnershipFields = new Set([
  "author",
  "authorId",
  "authorCanonicalKey",
  "authors",
  "canonicalAuthor",
  "canonicalAuthorIds",
  "canonicalFieldTrust",
  "canonicalTitle",
  "cover",
  "coverUrl",
  "editionId",
  "editions",
  "externalReadableSources",
  "hasEbook",
  "identityKeys",
  "isEbookAvailable",
  "originalLanguage",
  "providerExternalIds",
  "readableSource",
  "readableSources",
  "rightsMode",
  "titleAuthority",
  "workIdentity",
]);

const confidenceSchema = z.enum(["low", "medium", "high"]);

const stringArraySchema = z.array(z.string().trim().min(1).max(160)).max(40);

const ontologySchema = z
  .object({
    form: z.string().trim().min(1).max(80).optional(),
    subForm: z.string().trim().min(1).max(120).optional(),
    canonicalTradition: z.string().trim().min(1).max(160).optional(),
  })
  .strict();

const semanticRefsSchema = z
  .object({
    schemaVersion: z.literal(1),
    traditionEntityId: z.string().trim().min(1).max(160).optional(),
    movementEntityIds: stringArraySchema.optional(),
    philosophyEntityIds: stringArraySchema.optional(),
    civilizationEntityIds: stringArraySchema.optional(),
    historicalPeriodEntityIds: stringArraySchema.optional(),
  })
  .strict();

const embeddingDescriptorSchema = z
  .object({
    model: z.string().trim().min(1).max(120),
    dimensions: z.number().int().positive().max(100_000),
    vectorRef: z.string().trim().min(1).max(512),
    contentHash: z.string().trim().min(1).max(160),
    createdAt: z.string().trim().min(1).max(80),
  })
  .strict();

const provenanceSchema = z
  .object({
    source: z.literal(BOOKTOWN_REFINERY_PROVIDER_ID),
    artifactId: z.string().trim().min(1).max(256),
    factoryVersion: z.string().trim().min(1).max(80),
    contentHash: z.string().trim().min(1).max(160),
    generatedAt: z.string().trim().min(1).max(80),
  })
  .strict();

export const refineryArtifactDtoSchema = z
  .object({
    title: z.string().trim().min(1).max(512),
    canonicalKey: z.string().trim().min(1).max(512).optional(),
    ontology: ontologySchema.optional(),
    literaryQuality: z.number().min(0).max(1).optional(),
    canonicalPotential: z.number().min(0).max(1).optional(),
    confidence: confidenceSchema.optional(),
    semanticRefs: semanticRefsSchema.optional(),
    embeddingDescriptor: embeddingDescriptorSchema.optional(),
    provenance: provenanceSchema,
  })
  .strict();

export const submitRefineryArtifactsRequestSchema = z
  .object({
    artifacts: z.array(refineryArtifactDtoSchema).min(1).max(MAX_ARTIFACTS_PER_REQUEST),
    dryRun: z.boolean().optional(),
  })
  .strict();

type RefineryArtifactDTO = z.infer<typeof refineryArtifactDtoSchema>;

type SubmitRefineryArtifactsRequest = z.infer<typeof submitRefineryArtifactsRequestSchema>;

type ArtifactStatus = "accepted" | "rejected";

export type SubmitRefineryArtifactResult = {
  artifactId: string;
  status: ArtifactStatus;
  reason?: string;
  bookId?: string;
  canonicalKey?: string;
};

export type SubmitRefineryArtifactsResponse = {
  accepted: number;
  rejected: number;
  durationMs: number;
  dryRun: boolean;
  results: SubmitRefineryArtifactResult[];
};

type FirestoreLike = FirebaseFirestore.Firestore;

type ProcessDeps = {
  db?: FirestoreLike;
  materialize?: typeof materializeBookAuthority;
  nowMs?: () => number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function scanForbiddenField(value: unknown, path: string[] = []): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nested = scanForbiddenField(value[index], [...path, String(index)]);
      if (nested) return nested;
    }
    return null;
  }

  const record = asRecord(value);
  if (!record) return null;

  for (const [key, nestedValue] of Object.entries(record)) {
    if (forbiddenOwnershipFields.has(key)) {
      return [...path, key].join(".");
    }
    const nested = scanForbiddenField(nestedValue, [...path, key]);
    if (nested) return nested;
  }

  return null;
}

async function enforceRefinerySubmissionRateLimit(params: {
  db: FirestoreLike;
  uid: string;
  nowMs: number;
}): Promise<void> {
  const windowStartMs = params.nowMs - (params.nowMs % RATE_LIMIT_WINDOW_MS);
  const windowEndMs = windowStartMs + RATE_LIMIT_WINDOW_MS;
  const ref = params.db
    .collection("refinery_artifact_submission_quota")
    .doc(`${params.uid}_${windowStartMs}`);

  await params.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const countRaw = snap.exists ? snap.data()?.count : 0;
    const count = typeof countRaw === "number" && Number.isFinite(countRaw)
      ? Math.max(0, Math.trunc(countRaw))
      : 0;

    if (count >= RATE_LIMIT_MAX_REQUESTS) {
      throw new HttpsError("resource-exhausted", "REFINERY_RATE_LIMIT_EXCEEDED", {
        retryAfterSeconds: Math.max(1, Math.ceil((windowEndMs - params.nowMs) / 1000)),
      });
    }

    tx.set(
      ref,
      {
        uid: params.uid,
        count: count + 1,
        limit: RATE_LIMIT_MAX_REQUESTS,
        windowMs: RATE_LIMIT_WINDOW_MS,
        windowStartMs,
        windowEndMs,
        updatedAt: FieldValue.serverTimestamp(),
        ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true }
    );
  });
}

async function resolveTargetBook(params: {
  db: FirestoreLike;
  artifact: RefineryArtifactDTO;
}): Promise<{ bookId: string; canonicalKey: string } | null> {
  if (params.artifact.canonicalKey) {
    const snap = await params.db
      .collection("books")
      .where("canonicalKey", "==", params.artifact.canonicalKey)
      .limit(2)
      .get();

    if (snap.size !== 1) {
      return null;
    }

    const doc = snap.docs[0];
    return {
      bookId: doc.id,
      canonicalKey: String(doc.data().canonicalKey || params.artifact.canonicalKey),
    };
  }

  const snap = await params.db
    .collection("books")
    .where("title", "==", params.artifact.title)
    .limit(2)
    .get();

  if (snap.size !== 1) {
    return null;
  }

  const doc = snap.docs[0];
  return {
    bookId: doc.id,
    canonicalKey: String(doc.data().canonicalKey || ""),
  };
}

function buildAuthorityRawBook(artifact: RefineryArtifactDTO, target: {
  bookId: string;
  canonicalKey: string;
}): Record<string, unknown> {
  return {
    title: artifact.title,
    canonicalKey: target.canonicalKey || artifact.canonicalKey,
    source: BOOKTOWN_REFINERY_PROVIDER_ID,
    refineryArtifact: {
      ontology: artifact.ontology || null,
      literaryQuality: artifact.literaryQuality ?? null,
      canonicalPotential: artifact.canonicalPotential ?? null,
      confidence: artifact.confidence || null,
      semanticRefs: artifact.semanticRefs || null,
      embeddingDescriptor: artifact.embeddingDescriptor || null,
      provenance: artifact.provenance,
    },
  };
}

export async function processSubmitRefineryArtifacts(
  request: SubmitRefineryArtifactsRequest,
  deps: ProcessDeps = {}
): Promise<SubmitRefineryArtifactsResponse> {
  const startedAt = Date.now();
  const db = deps.db || admin.firestore();
  const materialize = deps.materialize || materializeBookAuthority;
  const dryRun = request.dryRun === true;
  const results: SubmitRefineryArtifactResult[] = [];

  for (const artifact of request.artifacts) {
    const artifactId = artifact.provenance.artifactId;
    const forbiddenField = scanForbiddenField(artifact);
    if (forbiddenField) {
      logger.warn("[BOOK_REFINERY][AUTHORITY_VIOLATION]", {
        artifactId,
        forbiddenField,
      });
      results.push({
        artifactId,
        status: "rejected",
        reason: `forbidden_authority_field:${forbiddenField}`,
      });
      continue;
    }

    const target = await resolveTargetBook({ db, artifact });
    if (!target) {
      logger.warn("[BOOK_REFINERY][ARTIFACT_REJECTED]", {
        artifactId,
        reason: "canonical_target_not_found_or_ambiguous",
      });
      results.push({
        artifactId,
        status: "rejected",
        reason: "canonical_target_not_found_or_ambiguous",
      });
      continue;
    }

    if (!dryRun) {
      await materialize({
        source: BOOKTOWN_REFINERY_PROVIDER_ID,
        authorityStatus: "provisional",
        preferredBookId: target.bookId,
        allowIdentityReuse: false,
        createEdition: false,
        rawBook: buildAuthorityRawBook(artifact, target),
      });
    }

    logger.info("[BOOK_REFINERY][ARTIFACT_ACCEPTED]", {
      artifactId,
      bookId: target.bookId,
      canonicalKey: target.canonicalKey || null,
      dryRun,
    });

    results.push({
      artifactId,
      status: "accepted",
      bookId: target.bookId,
      canonicalKey: target.canonicalKey || undefined,
    });
  }

  const accepted = results.filter((result) => result.status === "accepted").length;
  const rejected = results.length - accepted;
  const durationMs = Date.now() - startedAt;

  logger.info("[BOOK_REFINERY][SUBMISSION_COMPLETE]", {
    accepted,
    rejected,
    durationMs,
    dryRun,
  });

  return {
    accepted,
    rejected,
    durationMs,
    dryRun,
    results,
  };
}

export const submitRefineryArtifacts = onCall(
  {
    cors: true,
    enforceAppCheck: true,
    timeoutSeconds: 120,
    memory: "512MiB",
    maxInstances: 10,
  },
  async (request: CallableRequest<unknown>) => {
    const startedAt = Date.now();
    const caller = await assertActiveAuthenticatedUser(request.auth);
    assertRoleFromClaims(caller, ["superadmin", "system"]);

    if (!request.app) {
      throw new HttpsError("failed-precondition", "APP_CHECK_REQUIRED");
    }

    const parsed = submitRefineryArtifactsRequestSchema.safeParse(request.data);
    if (!parsed.success) {
      logger.warn("[BOOK_REFINERY][INVALID_SCHEMA]", {
        uid: caller.uid,
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
      throw new HttpsError("invalid-argument", "INVALID_REFINERY_ARTIFACT_SCHEMA");
    }

    const db = admin.firestore();
    await enforceRefinerySubmissionRateLimit({
      db,
      uid: caller.uid,
      nowMs: Date.now(),
    });

    const response = await processSubmitRefineryArtifacts(parsed.data, { db });
    logger.info("[BOOK_REFINERY][CALLABLE_DURATION]", {
      uid: caller.uid,
      durationMs: Date.now() - startedAt,
      accepted: response.accepted,
      rejected: response.rejected,
    });
    return response;
  }
);
