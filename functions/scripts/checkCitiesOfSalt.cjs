const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();

async function run() {
  const doc = await db.collection("books").doc("84073272-f022-40c3-b588-e317cb3dd21e").get();
  console.log(doc.data());
}

run().catch(console.error);