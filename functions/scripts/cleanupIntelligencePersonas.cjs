#!/usr/bin/env node

/**
 * CLEANUP SCRIPT
 * Removes ONLY synthetic intelligence test personas and all related projections.
 *
 * Requires:
 *   --confirm=CLEAN_INTELLIGENCE
 *
 * Safety:
 *   - Hardcoded UIDs (cannot accidentally wipe real users)
 *   - Explicit confirmation flag required
 *   - Batched deletes
 */

const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const CONFIRM_FLAG = "--confirm=CLEAN_INTELLIGENCE";

const TEST_UIDS = [
  "test_depth_reader_001",
  "test_explorer_001",
  "test_casual_reader_001"
];

async function main() {
  if (!process.argv.includes(CONFIRM_FLAG)) {
    console.error("\n❌ Refusing to run.");
    console.error("This script deletes data.");
    console.error(`Run with: node cleanupIntelligencePersonas.cjs ${CONFIRM_FLAG}\n`);
    process.exit(1);
  }

  const serviceAccountPath = path.resolve(
    __dirname,
    "../../scripts/serviceAccountKey.json"
  );

  if (!fs.existsSync(serviceAccountPath)) {
    console.error("❌ serviceAccountKey.json not found.");
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath))
  });

  const db = admin.firestore();

  console.log("\n🔄 Starting cleanup of synthetic personas...\n");

  for (const uid of TEST_UIDS) {
    console.log(`\n--- Cleaning UID: ${uid} ---`);

    // 1️⃣ Delete Auth user
    try {
      await admin.auth().deleteUser(uid);
      console.log("✔ Auth user deleted");
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        console.log("• Auth user already deleted");
      } else {
        console.error("Auth delete error:", err.message);
      }
    }

    // 2️⃣ Delete users/{uid}
    await safeDeleteDoc(db.collection("users").doc(uid), "users doc");

    // 3️⃣ Delete user_library_books where uid == uid
    await deleteQueryBatch(
      db.collection("user_library_books").where("uid", "==", uid),
      "user_library_books"
    );

    // 4️⃣ Delete reading_progress where uid == uid
    await deleteQueryBatch(
      db.collection("reading_progress").where("uid", "==", uid),
      "reading_progress"
    );

    // 5️⃣ Delete user_reviews where uid == uid
    await deleteQueryBatch(
      db.collection("user_reviews").where("uid", "==", uid),
      "user_reviews"
    );

    // 6️⃣ Delete nested reviews in books collection
    const booksSnap = await db.collection("books").get();
    for (const bookDoc of booksSnap.docs) {
      const reviewsRef = bookDoc.ref.collection("reviews").where("uid", "==", uid);
      await deleteQueryBatch(reviewsRef, `books/${bookDoc.id}/reviews`);
    }

    // 7️⃣ Delete quotes subcollection
    await deleteSubcollection(
      db.collection("users").doc(uid),
      "quotes"
    );

    // 8️⃣ Delete intelligence profile
    await deleteSubcollection(
      db.collection("user_intelligence_profiles").doc(uid),
      "metadata"
    );
    await deleteSubcollection(
      db.collection("user_intelligence_profiles").doc(uid),
      "reading"
    );
    await deleteSubcollection(
      db.collection("user_intelligence_profiles").doc(uid),
      "genres"
    );
    await deleteSubcollection(
      db.collection("user_intelligence_profiles").doc(uid),
      "authors"
    );
    await deleteSubcollection(
      db.collection("user_intelligence_profiles").doc(uid),
      "behavior"
    );
    await deleteSubcollection(
      db.collection("user_intelligence_profiles").doc(uid),
      "engagement"
    );
    await deleteSubcollection(
      db.collection("user_intelligence_profiles").doc(uid),
      "indices"
    );
    await deleteSubcollection(
      db.collection("user_intelligence_profiles").doc(uid),
      "history"
    );
    await deleteSubcollection(
      db.collection("user_intelligence_profiles").doc(uid),
      "embeddings"
    );

    await safeDeleteDoc(
      db.collection("user_intelligence_profiles").doc(uid),
      "user_intelligence_profiles root doc"
    );

    // 9️⃣ Delete queue entries
    await deleteQueryBatch(
      db.collection("intelligence_signal_queue").where("uid", "==", uid),
      "intelligence_signal_queue"
    );
  }

  console.log("\n✅ Cleanup complete.\n");
  process.exit(0);
}

async function safeDeleteDoc(docRef, label) {
  const snap = await docRef.get();
  if (!snap.exists) {
    console.log(`• ${label} already deleted`);
    return;
  }
  await docRef.delete();
  console.log(`✔ Deleted ${label}`);
}

async function deleteSubcollection(parentRef, subcollectionName) {
  const subRef = parentRef.collection(subcollectionName);
  const snap = await subRef.get();
  if (snap.empty) return;

  const batch = parentRef.firestore.batch();
  snap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  console.log(`✔ Deleted subcollection: ${subcollectionName}`);
}

async function deleteQueryBatch(query, label) {
  const snap = await query.get();
  if (snap.empty) {
    console.log(`• No documents in ${label}`);
    return;
  }

  const batch = query.firestore.batch();
  snap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  console.log(`✔ Deleted ${snap.size} docs from ${label}`);
}

main().catch(err => {
  console.error("\n❌ Fatal cleanup error:", err);
  process.exit(1);
});