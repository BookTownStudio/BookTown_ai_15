const admin = require("firebase-admin");
const {
  assertSafeFirestoreScript,
  readBoundedCollectionPage,
} = require("./firestoreScriptSafety.cjs");

const safety = assertSafeFirestoreScript("fillCanonicalTier");
admin.initializeApp();
const db = admin.firestore();

async function run() {
  const snap = await readBoundedCollectionPage(db.collection("books"), safety);

  const batch = db.batch();

  snap.forEach(doc => {
    const data = doc.data();

    if (!data.canonicalTier) {
      if (!safety.dryRun) {
        batch.update(doc.ref, {
          canonicalTier: 1
        });
      }
      console.log(safety.dryRun ? "would add tier:" : "tier added:", data.title);
    }
  });

  if (!safety.dryRun) {
    await batch.commit();
  }

  console.log("canonicalTier repair complete.");
}

run();
