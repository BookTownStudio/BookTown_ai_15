/**
 * Add canonicalType to all books
 *
 * Rules:
 * - default: "literary"
 * - override: "religious" for known works
 *
 * Safety:
 * - dry-run by default
 * - requires --confirm=true to write
 */

const admin = require("firebase-admin");

const DRY_RUN = process.argv.includes("--dry-run=false") ? false : true;
const CONFIRM = process.argv.includes("--confirm=true");

admin.initializeApp();
const db = admin.firestore();

// -----------------------------
// 🕌 RELIGIOUS TITLES
// -----------------------------
const RELIGIOUS_TITLES = new Set([
  "The Quran",
  "The Bible",
  "Tanakh",
]);

// -----------------------------
// 🚀 MAIN
// -----------------------------
(async () => {
  console.log("[CANONICAL_TYPE][START]", { dryRun: DRY_RUN });

  const snap = await db.collection("books").get();

  let updated = 0;
  let unchanged = 0;

  for (const doc of snap.docs) {
    const data = doc.data();

    const newType = RELIGIOUS_TITLES.has(data.title)
      ? "religious"
      : "literary";

    if (data.canonicalType === newType) {
      unchanged++;
      continue;
    }

    console.log("[UPDATE]", {
      id: doc.id,
      title: data.title,
      from: data.canonicalType || null,
      to: newType,
    });

    if (!DRY_RUN) {
      if (!CONFIRM) {
        throw new Error("Missing --confirm=true for write operation");
      }

      await db.collection("books").doc(doc.id).update({
        canonicalType: newType,
        updatedAt: Date.now(),
      });
    }

    updated++;
  }

  console.log("[CANONICAL_TYPE][COMPLETE]", {
    total: snap.size,
    updated,
    unchanged,
  });

  process.exit();
})();