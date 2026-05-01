const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();

async function run() {
  await db.collection("books").doc("f3b9498f-0127-4337-a240-3d234f025fd0").update({
    publicationYear: 1937,
    authorCanonicalKey: "yasunari kawabata::1899"
  });

  console.log("Normalized Snow Country");
}

run().catch(console.error);