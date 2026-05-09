import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

import {
  normalizeLiteraryRelationshipType,
  type LiteraryRelationshipType,
} from "../src/library/ontology/literaryRelationshipTypes";

admin.initializeApp();

const db = admin.firestore();

type ApprovedRelationship = {
  sourceTitle: string;
  sourceAuthor: string;
  targetTitle: string;
  targetAuthor: string;
  relationshipType: LiteraryRelationshipType;
};

function asNonEmptyString(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeKey(value: unknown): string {
  return asNonEmptyString(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function parseArgs(): Record<string, string> {
  const result: Record<string, string> = {};

  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--")) continue;

    const [key, value] = arg.slice(2).split("=");

    if (key && value) {
      result[key] = value;
    }
  }

  return result;
}

function readAuthorityFile(
  authorityFile: string
): ApprovedRelationship[] {
  const raw = fs.readFileSync(
    authorityFile,
    "utf8"
  );

  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error(
      "Authority file must contain an array."
    );
  }

  return parsed.map((entry, index) => {
    const relationshipType =
      normalizeLiteraryRelationshipType(
        entry.relationshipType
      );

    if (!relationshipType) {
      throw new Error(
        `Invalid relationshipType at index ${index}.`
      );
    }

    return {
      sourceTitle: asNonEmptyString(
        entry.sourceTitle
      ),
      sourceAuthor: asNonEmptyString(
        entry.sourceAuthor
      ),
      targetTitle: asNonEmptyString(
        entry.targetTitle
      ),
      targetAuthor: asNonEmptyString(
        entry.targetAuthor
      ),
      relationshipType,
    };
  });
}

async function findBookId(
  title: string,
  author: string
): Promise<string | null> {
  const snapshot = await db
    .collection("books")
    .get();

  for (const doc of snapshot.docs) {
    const data = doc.data();

    const bookTitle =
      data.canonicalTitle ||
      data.title ||
      "";

    const bookAuthor =
      data.author ||
      data.authorName ||
      (Array.isArray(data.authorNames)
        ? data.authorNames[0]
        : "");

    if (
      normalizeKey(bookTitle) ===
        normalizeKey(title) &&
      normalizeKey(bookAuthor) ===
        normalizeKey(author)
    ) {
      return doc.id;
    }
  }

  return null;
}

async function main() {
  const args = parseArgs();

  const authorityFile = path.resolve(
    process.cwd(),
    args.authority ||
      "data/literaryRelationships.v1.approved.json"
  );

  const dryRun =
    args["dry-run"] !== "false";

  const relationships =
    readAuthorityFile(authorityFile);

  let matchedRelationships = 0;
  let wouldWrite = 0;
  let committedWrites = 0;

  const batch = db.batch();

  for (const relationship of relationships) {
    const sourceBookId =
      await findBookId(
        relationship.sourceTitle,
        relationship.sourceAuthor
      );

    const targetBookId =
      await findBookId(
        relationship.targetTitle,
        relationship.targetAuthor
      );

    if (
      !sourceBookId ||
      !targetBookId
    ) {
      continue;
    }

    matchedRelationships++;

    const relationshipRef = db
      .collection("literary_relationships")
      .doc();

    wouldWrite++;

    if (!dryRun) {
      batch.set(relationshipRef, {
        sourceBookId,
        targetBookId,
        relationshipType:
          relationship.relationshipType,

        sourceTitle:
          relationship.sourceTitle,

        sourceAuthor:
          relationship.sourceAuthor,

        targetTitle:
          relationship.targetTitle,

        targetAuthor:
          relationship.targetAuthor,

        createdAt:
          admin.firestore.FieldValue.serverTimestamp(),

        authoritySource:
          "literaryRelationships.v1.approved",
      });

      committedWrites++;
    }
  }

  if (!dryRun && committedWrites > 0) {
    await batch.commit();
  }

  console.log(
    "\n[LITERARY_RELATIONSHIPS_APPLY][SUMMARY]",
    JSON.stringify(
      {
        dryRun,
        authorityFile,
        approvedRelationships:
          relationships.length,
        matchedRelationships,
        wouldWrite,
        committedWrites,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    "[LITERARY_RELATIONSHIPS_APPLY][FAIL]",
    error
  );

  process.exit(1);
});