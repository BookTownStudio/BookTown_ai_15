const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

async function run() {
  const snap = await db.collection("books").get();

  const batch = db.batch();

  snap.forEach(doc => {
    const data = doc.data();

    if (!data.canonicalTier) {
      batch.update(doc.ref, {
        canonicalTier: 1
      });
      console.log("tier added:", data.title);
    }
  });

  await batch.commit();

  console.log("canonicalTier repair complete.");
}

run();