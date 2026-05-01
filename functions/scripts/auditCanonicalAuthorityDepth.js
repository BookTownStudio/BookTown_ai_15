const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

async function run() {
  const snap = await db.collection("books").get();

  const weak = [];

  snap.forEach(doc => {
    const b = doc.data();

    const missing = [];

    if (!b.author) missing.push("author");
    if (!b.publicationYear) missing.push("publicationYear");
    if (!b.originalLanguage) missing.push("originalLanguage");
    if (!b.literaryForm) missing.push("literaryForm");
    if (!b.canonicalTier) missing.push("canonicalTier");

    if (missing.length) {
      weak.push({
        id: doc.id,
        title: b.title,
        author: b.author || null,
        missing
      });
    }
  });

  if (!weak.length) {
    console.log("All canonical books complete.");
    return;
  }

  console.table(weak);
}

run();