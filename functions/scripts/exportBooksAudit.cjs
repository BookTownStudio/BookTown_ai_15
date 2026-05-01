const admin = require("firebase-admin");

console.log("🔹 INIT: Starting script...");

try {
  admin.initializeApp();
  console.log("✅ Firebase Admin initialized");
} catch (e) {
  console.error("❌ Firebase init error:", e);
}

const db = admin.firestore();

async function run() {
  console.log("🔹 RUN: Querying Firestore...");

  try {
    const snap = await db.collection("books").limit(50).get();

    console.log("📊 SNAPSHOT RECEIVED");
    console.log("📦 Document count:", snap.size);

    if (snap.empty) {
      console.warn("⚠️ No documents found in 'books' collection");
      return;
    }

    const rows = [];

    snap.forEach(doc => {
      const d = doc.data();

      console.log("📄 Processing doc:", doc.id);

      rows.push({
        id: doc.id,
        title: d.title || null,
        author: d.author || null,
        authorCanonicalKey: d.authorCanonicalKey || null,
        authorityStatus: d.authorityStatus || null,
        language: d.language || null,
        publicationYear: d.publicationYear || null,
        literaryForm: d.literaryForm || null,
        description: d.description || d.descriptionEn || d.abstractDescription || null,
        providers: d.acquiredFromProvider || null
      });
    });

    console.log("✅ FINAL OUTPUT:");
    console.log(JSON.stringify(rows, null, 2));

  } catch (err) {
    console.error("❌ ERROR during Firestore query:", err);
  }

  console.log("🔹 END: Script finished");
}

run();
