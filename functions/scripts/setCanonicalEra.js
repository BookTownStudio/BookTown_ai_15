const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

async function run() {
  const updates = [
    // Ancient / Epic
    {
      id: "812ea7ac-7ba7-410b-b1b4-6eec796de59f", // Mahabharata
      data: { publicationYear: null, canonicalEra: "ancient" }
    },
    {
      id: "b161fb8b-656b-44db-b043-0e6a62a75047", // Mahabharata duplicate (if exists)
      data: { publicationYear: null, canonicalEra: "ancient" }
    },
    {
      id: "9441ba0f-2390-4785-a59c-891bc5e49025", // Bhagavad Gita
      data: { publicationYear: null, canonicalEra: "ancient" }
    },
    {
      id: "e760b97f-4a81-4aad-ba29-30ffe10a9a63", // Gilgamesh
      data: { publicationYear: null, canonicalEra: "ancient" }
    },

    // Classical antiquity
    {
      id: "edb03891-e4d2-481f-a55d-5fe32c755571", // Oresteia
      data: { publicationYear: null, canonicalEra: "classical" }
    },
    {
      id: "a31a74a4-ac9a-4146-b495-57bdfb76f402", // Aeneid
      data: { publicationYear: null, canonicalEra: "classical" }
    },

    // Persian / medieval poetic canon
    {
      id: "dd5c24f3-f17a-404e-be23-9642fd8d8d3d", // Divan of Hafez
      data: { publicationYear: null, canonicalEra: "medieval" }
    },
    {
      id: "ddf4ca6d-4a3f-4a57-9b1e-5edcd3a5627c", // Conference of the Birds
      data: { publicationYear: null, canonicalEra: "medieval" }
    }
  ];

  for (const u of updates) {
    await db.collection("books").doc(u.id).update(u.data);
    console.log("updated era:", u.id, "→", u.data.canonicalEra);
  }

  console.log("Canonical era assignment complete.");
}

run();