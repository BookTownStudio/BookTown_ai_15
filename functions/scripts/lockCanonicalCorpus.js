const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

async function run() {
  const snap = await db.collection("books").get();

  let count = 0;

  for (const doc of snap.docs) {
    const data = doc.data();

    // Safety: skip already locked
    if (data.canonicalLocked) continue;

    await doc.ref.update({
      canonicalLocked: true,
      canonicalVersion: 1,
      canonicalSource: "booktown_curated",
      lockedAt: new Date().toISOString()
    });

    count++;
    console.log("locked:", data.title);
  }

  console.log(`\nDONE → ${count} books locked.`);
}

run();