import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

import {
  normalizeBookForm,
  type BookForm,
} from "../src/library/ontology/bookOntology";

admin.initializeApp();

const db = admin.firestore();

type ApprovedEntry = {
  canonicalTitle: string;
  canonicalAuthor: string;
  approvedForm: BookForm;
};

function asNonEmptyString(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function buildKey(
  title: string,
  author: string
): string {
  return `${normalizeKey(title)}::${normalizeKey(author)}`;
}

function readAuthorityFile(
  filePath: string
): ApprovedEntry[] {
  const raw = fs.readFileSync(
    filePath,
    "utf8"
  );

  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error(
      "Authority file must be an array."
    );
  }

  return parsed.map((entry, index) => {
    const canonicalTitle =
      asNonEmptyString(
        entry?.canonicalTitle
      );

    const canonicalAuthor =
      asNonEmptyString(
        entry?.canonicalAuthor
      );

    const approvedForm =
      normalizeBookForm(
        entry?.approvedForm
      );

    if (
      !canonicalTitle ||
      !canonicalAuthor ||
      approvedForm === "unknown"
    ) {
      throw new Error(
        `Invalid form authority entry at index ${index}.`
      );
    }

    return {
      canonicalTitle,
      canonicalAuthor,
      approvedForm,
    };
  });
}

async function main() {
  const args = process.argv
    .slice(2)
    .reduce<Record<string, string>>(
      (acc, arg) => {
        const [key, value] =
          arg.split("=");

        acc[
          key.replace(/^--/, "")
        ] = value;

        return acc;
      },
      {}
    );

  const dryRun =
    args["dry-run"] !== "false";

  const authorityFile =
    path.resolve(
      process.cwd(),
      args["authority"] ||
        "data/formAuthority.v1.approved.json"
    );

  const approvedEntries =
    readAuthorityFile(authorityFile);

  const authorityMap = new Map<
    string,
    ApprovedEntry
  >();

  for (const entry of approvedEntries) {
    authorityMap.set(
      buildKey(
        entry.canonicalTitle,
        entry.canonicalAuthor
      ),
      entry
    );
  }

  const snapshot =
    await db.collection("books").get();

  let matchedBooks = 0;
  let alreadyUpToDate = 0;
  let wouldWrite = 0;
  let committedWrites = 0;

  const batch = db.batch();

  for (const doc of snapshot.docs) {
    const data = doc.data();

    const title =
      asNonEmptyString(
        data.canonicalTitle ||
          data.title
      );

    const author =
      asNonEmptyString(
        data.author ||
          data.authorName
      );

    const key = buildKey(
      title,
      author
    );

    const authority =
      authorityMap.get(key);

    if (!authority) {
      continue;
    }

    matchedBooks++;

    const currentForm =
      normalizeBookForm(
        data?.ontology?.form
      );

    if (
      currentForm ===
      authority.approvedForm
    ) {
      alreadyUpToDate++;
      continue;
    }

    wouldWrite++;

    if (!dryRun) {
      batch.update(doc.ref, {
        literaryForm:
          authority.approvedForm,
        "ontology.form":
          authority.approvedForm,
      });

      committedWrites++;
    }
  }

  if (!dryRun && committedWrites > 0) {
    await batch.commit();
  }

  console.log(
    "\n[FORM_AUTHORITY_APPLY][SUMMARY]",
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
    "[FORM_AUTHORITY_APPLY][FAIL]",
    error
  );

  process.exit(1);
});