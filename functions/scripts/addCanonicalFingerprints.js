const admin = require("firebase-admin");
const {
  assertSafeFirestoreScript,
  readBoundedCollectionPage,
} = require("./firestoreScriptSafety.cjs");

const safety = assertSafeFirestoreScript("addCanonicalFingerprints");
admin.initializeApp();
const db = admin.firestore();

function normalize(text = "") {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFingerprint(book) {
  const title = normalize(book.title || "");
  const author = normalize(book.authorCanonicalKey || book.author || "");

  if (!title || !author) return null;

  return `${title}::${author}`;
}

async function run() {
  const snap = await readBoundedCollectionPage(db.collection("books"), safety);

  let updated = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data();

    const fingerprint = buildFingerprint(data);

    if (!fingerprint) {
      skipped++;
      continue;
    }

    if (data.canonicalFingerprint === fingerprint) {
      skipped++;
      continue;
    }

    if (!safety.dryRun) {
      await doc.ref.update({
        canonicalFingerprint: fingerprint
      });
    }

    updated++;

    console.log(safety.dryRun ? "would update:" : "updated:", data.title, "→", fingerprint);
  }

  console.log("\nDone");
  console.log("updated:", updated);
  console.log("skipped:", skipped);
}

run();
