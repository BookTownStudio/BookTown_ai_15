const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();

async function run() {
  const ids = [
    "25efbe24-1d5b-4988-b328-6d8811c0e9fc",
    "73eebdf4-baea-4956-9e05-0416d9f56f56"
  ];

  for (const id of ids) {
    const doc = await db.collection("books").doc(id).get();
    console.log("\n---", id, "---");
    console.log(doc.data());
  }
}

run().catch(console.error);