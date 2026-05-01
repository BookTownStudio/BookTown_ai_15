const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const fixes = {
  "The Trial": {
    publicationYear: 1925,
    originalLanguage: "German"
  },
  "Madame Bovary": {
    publicationYear: 1856,
    originalLanguage: "French"
  },
  "Anna Karenina": {
    publicationYear: 1878,
    originalLanguage: "Russian"
  },
  "Crime and Punishment": {
    publicationYear: 1866,
    originalLanguage: "Russian"
  },
  "Hamlet": {
    publicationYear: 1603,
    originalLanguage: "English"
  },
  "Macbeth": {
    publicationYear: 1606,
    originalLanguage: "English"
  },
  "The Odyssey": {
    publicationYear: -700,
    originalLanguage: "Ancient Greek"
  },
  "The Divine Comedy": {
    publicationYear: 1320,
    originalLanguage: "Italian"
  },
  "Dead Souls": {
    originalLanguage: "Russian"
  },
  "The Tale of Genji": {
    publicationYear: 1008,
    originalLanguage: "Japanese"
  },
  "The Aleph": {
    publicationYear: 1945,
    originalLanguage: "Spanish"
  },
  "The Book of Disquiet": {
    publicationYear: 1982,
    originalLanguage: "Portuguese"
  }
};

async function run() {
  const snap = await db.collection("books").get();

  for (const doc of snap.docs) {
    const data = doc.data();
    const fix = fixes[data.title];

    if (!fix) continue;

    const patch = {};

    if (!data.publicationYear && fix.publicationYear !== undefined) {
      patch.publicationYear = fix.publicationYear;
    }

    if (!data.originalLanguage && fix.originalLanguage) {
      patch.originalLanguage = fix.originalLanguage;
    }

    if (Object.keys(patch).length) {
      await doc.ref.update(patch);
      console.log("updated:", data.title, patch);
    }
  }

  console.log("done");
}

run();