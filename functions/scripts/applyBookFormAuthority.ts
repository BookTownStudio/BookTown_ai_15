import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

admin.initializeApp();

const db = admin.firestore();

type ApprovedEntry = {
  canonicalTitle: string;
  canonicalAuthor: string;
  approvedForm: string;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function buildKey(title: string, author: string): string {
  return `${normalize(title)}::${normalize(author)}`;
}

async function main() {
  const authorityPath = path.resolve(
    __dirname,
    "../data/bookFormAuthority.v1.approved.json"
  );

  const authority =
    JSON.parse(
      fs.readFileSync(authorityPath, "utf8")
    ) as ApprovedEntry[];

  const authorityMap = new Map<string, ApprovedEntry>();

  for (const entry of authority) {
    authorityMap.set(
      buildKey(
        entry.canonicalTitle,
        entry.canonicalAuthor
      ),
      entry
    );
  }

  const snapshot = await db.collection("books").get();

  let updated = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();

    const title =
      data.canonicalTitle ||
      data.title ||
      "";

    const author =
      data.author ||
      data.authorName ||
      (Array.isArray(data.authorNames)
        ? data.authorNames[0]
        : "");

    const match =
      authorityMap.get(buildKey(title, author));

    if (!match) continue;

    await doc.ref.update({
      literaryForm: match.approvedForm,
      "ontology.form": match.approvedForm,
    });

    updated++;
  }

  console.log(
    JSON.stringify(
      {
        updated,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});