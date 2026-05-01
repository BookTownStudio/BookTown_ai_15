const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();

async function run() {
  await db.collection("books").doc("2a251222-19d3-4031-a329-3b4bad26b357").update({
    publicationYear: 1975,
    literaryForm: "novel"
  });

  await db.collection("books").doc("6c837a7a-1d00-4d29-b661-dbffbdb6f29c").update({
    publicationYear: 1978,
    literaryForm: "novel",
    description: "A historical novel by Ismail Kadare using the construction of a bridge in the Balkans to explore empire, fear, and the arrival of political transformation."
  });

  console.log("Final normalization complete");
}

run().catch(console.error);