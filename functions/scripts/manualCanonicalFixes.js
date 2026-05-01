const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

async function run() {
  const updates = [
    { id: "2989dcc1-99ce-4702-a238-3a5d41dec210", data: { publicationYear: 1932 } }, // Radetzky
    { id: "664a89e5-6188-4fb8-bb11-ce039b37d8fc", data: { publicationYear: 1935 } }, // Auto-da-Fé
    { id: "70643325-3c02-4fb6-8c05-816a5a6b76c7", data: { publicationYear: 1949 } }, // Second Sex
    { id: "7e855873-c53b-4b41-8fa2-0d52d944ba2f", data: { publicationYear: 1980 } }, // Name of the Rose
    { id: "89b769a8-d615-4bd8-b482-fb92f64cca76", data: { publicationYear: 1967 } }, // Master & Margarita
    { id: "8a9f4ad6-f2e6-44be-a12f-707533ff6f2a", data: { publicationYear: 1945 } }, // Death of Virgil
    { id: "a235c57d-bd8b-497c-a7bb-6474acb71ab8", data: { publicationYear: 1982 } }, // House of Spirits
    { id: "a243eff8-2c3a-4c60-b7a0-40df6486295e", data: { publicationYear: 1883 } }, // Zarathustra
    { id: "a7ec1e1b-a115-4e34-9c64-24363d0cfe41", data: { publicationYear: 1966 } }, // Season Migration
    { id: "b69373f0-de13-4bd0-9563-333523c916a4", data: { publicationYear: 1948 } }, // Makioka Sisters
    { id: "f4cab4e7-f2f3-461c-863a-ba2a81571851", data: { publicationYear: 2007 } }, // Vegetarian
    { id: "fed28166-054f-42e3-a07a-c0a1d9b8bd89", data: { publicationYear: 1871 } }  // Middlemarch
  ];

  for (const u of updates) {
    await db.collection("books").doc(u.id).update(u.data);
    console.log("updated:", u.id);
  }

  console.log("Manual canonical fixes complete.");
}

run();