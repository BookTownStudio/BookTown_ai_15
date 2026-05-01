const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();

async function run() {
  const doc = await db.collection("books").doc("f3b9498f-0127-4337-a240-3d234f025fd0").get();
  console.log(doc.data());
}

run().catch(console.error);