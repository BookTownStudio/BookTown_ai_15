const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();

async function run() {
  await db.collection("books").doc("25efbe24-1d5b-4988-b328-6d8811c0e9fc").update({
    language: "ru",
    publicationYear: 1980,
    literaryForm: "novel",
    authorCanonicalKey: "vasily grossman::1905",
    description: "A monumental novel by Vasily Grossman portraying war, totalitarianism, and moral endurance across the Soviet world during World War II."
  });

  await db.collection("books").doc("73eebdf4-baea-4956-9e05-0416d9f56f56").update({
    author: "Gabriel García Márquez",
    authorCanonicalKey: "gabriel garcia marquez::1927",
    publicationYear: 1975,
    language: "es",
    literaryForm: "novel",
    description: "A dense political novel by Gabriel García Márquez portraying absolute power, decay, and solitude through the figure of an aging dictator."
  });

  console.log("Normalized batch 120");
}

run().catch(console.error);