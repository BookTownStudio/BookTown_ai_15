import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

import {
  normalizeSubForm,
  type BookSubForm,
} from "../src/library/ontology/bookOntology";

admin.initializeApp();

const db = admin.firestore();

type ApprovedEntry = {
  canonicalTitle: string;
  canonicalAuthor: string;
  approvedSubForm: BookSubForm;
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
): ApprovedEntry[] {
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
    const canonicalTitle = asNonEmptyString(
      entry.canonicalTitle
    );

    const canonicalAuthor = asNonEmptyString(
      entry.canonicalAuthor
    );

    const approvedSubForm = normalizeSubForm(
      entry.approvedSubForm
    );

    if (
      !canonicalTitle ||
      !canonicalAuthor ||
      !approvedSubForm
    ) {
      throw new Error(
        `Invalid authority entry at index ${index}.`
      );
    }

    return {
      canonicalTitle,
      canonicalAuthor,
      approvedSubForm,
    };
  });
}

async function main() {
  const args = parseArgs();

  const authorityFile = path.resolve(
    process.cwd(),
    args.authority ||
      "data/subFormAuthority.v1.approved.json"
  );

  const dryRun =
    args["dry-run"] !== "false";

  const approvedEntries =
    readAuthorityFile(authorityFile);

  const snapshot = await db
    .collection("books")
    .get();

  const books = snapshot.docs;

  let matchedBooks = 0;
  let alreadyUpToDate = 0;
  let wouldWrite = 0;
  let committedWrites = 0;

  const batch = db.batch();

  for (const entry of approvedEntries) {
    const matchedBook = books.find((doc) => {
      const data = doc.data();

      const title =
        data.canonicalTitle ||
        data.title;

      const author =
        data.author ||
        data.authorName ||
        (Array.isArray(data.authorNames)
          ? data.authorNames[0]
          : "");

      return (
        normalizeKey(title) ===
          normalizeKey(
            entry.canonicalTitle
          ) &&
        normalizeKey(author) ===
          normalizeKey(
            entry.canonicalAuthor
          )
      );
    });

    if (!matchedBook) {
      continue;
    }

    matchedBooks++;

    const data = matchedBook.data();

    const currentSubForm =
      normalizeSubForm(
        data?.ontology?.subForm
      );

    if (
      currentSubForm ===
      entry.approvedSubForm
    ) {
      alreadyUpToDate++;
      continue;
    }

    wouldWrite++;

    if (!dryRun) {
      batch.update(
        matchedBook.ref,
        {
          "ontology.subForm":
            entry.approvedSubForm,
        }
      );

      committedWrites++;
    }
  }

  if (!dryRun && committedWrites > 0) {
    await batch.commit();
  }

  console.log(
    "\n[SUBFORM_AUTHORITY_APPLY][SUMMARY]",
    JSON.stringify(
      {
        dryRun,
        authorityFile,
        approvedEntries:
          approvedEntries.length,
        matchedBooks,
        alreadyUpToDate,
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
    "[SUBFORM_AUTHORITY_APPLY][FAIL]",
    error
  );

  process.exit(1);
});