const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

function normalizeTitle(text = "") {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFingerprint(book) {
  const title = normalizeTitle(book.title || "");
  const authorKey = String(book.authorCanonicalKey || "").trim();

  if (!title || !authorKey) return null;

  return `${title}::${authorKey}`;
}

async function run() {
  const snap = await db.collection("books").get();

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

    await doc.ref.update({
      canonicalFingerprint: fingerprint
    });

    updated++;

    console.log("updated:", data.title, "→", fingerprint);
  }

  console.log("\nDone");
  console.log("updated:", updated);
  console.log("skipped:", skipped);
}

run();