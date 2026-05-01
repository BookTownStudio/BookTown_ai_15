const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();

async function run() {
  await db.collection("books").doc("20a93426-4113-48ef-bb0b-0287a4f40426").update({
    language: "ru",
    publicationYear: 1842,
    literaryForm: "novel",
    description: "A satirical novel by Nikolai Gogol following Chichikov’s journey through provincial Russia, exposing bureaucracy, greed, and moral decay.",
    authorCanonicalKey: "nikolai gogol::1809"
  });

  console.log("Normalized Dead Souls");
}

run().catch(console.error);