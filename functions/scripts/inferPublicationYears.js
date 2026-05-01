const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

function extractBirthYear(key = "") {
  const match = key.match(/::(-?\d+)/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

function inferYear(book) {
  const birth = extractBirthYear(book.authorCanonicalKey);
  if (!birth) return null;

  const form = (book.literaryForm || "").toLowerCase();

  let offset = 40;

  if (form.includes("philosophy")) offset = 50;
  else if (form.includes("poetry")) offset = 35;
  else if (form.includes("play")) offset = 38;
  else if (form.includes("epic")) return null; // skip ancient
  else if (form.includes("religious")) return null;

  return birth + offset;
}

async function run() {
  const snap = await db.collection("books").get();

  for (const doc of snap.docs) {
    const b = doc.data();

    if (b.publicationYear) continue;

    const inferred = inferYear(b);

    if (!inferred) continue;

    await doc.ref.update({
      publicationYear: inferred,
      inferredYear: true
    });

    console.log("inferred:", b.title, "→", inferred);
  }

  console.log("Inference complete.");
}

run();