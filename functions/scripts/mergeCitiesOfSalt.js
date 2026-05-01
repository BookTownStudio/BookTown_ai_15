const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

async function run() {
  const keepId = "84073272-f022-40c3-b588-e317cb3dd21e";

  const removeIds = [
    "5afc4a63-b0d3-45d9-a9a9-ad5b751db499",
    "f94d8b46-1e1d-4bd9-88e3-1465219910e2"
  ];

  for (const id of removeIds) {
    await db.collection("books").doc(id).delete();
    console.log("deleted:", id);
  }

  console.log("kept:", keepId);
}

run();