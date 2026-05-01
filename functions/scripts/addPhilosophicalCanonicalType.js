/**
 * Add philosophical canonicalType to relevant works
 *
 * Rules:
 * - Only apply to known philosophical works
 * - Do NOT override religious
 * - Do NOT touch already philosophical
 *
 * Safe:
 * - dry-run by default
 * - requires --confirm=true for writes
 */

const admin = require("firebase-admin");

const DRY_RUN = process.argv.includes("--dry-run=false") ? false : true;
const CONFIRM = process.argv.includes("--confirm=true");

admin.initializeApp();
const db = admin.firestore();

// --------------------------------
// 🧠 PHILOSOPHICAL WHITELIST
// --------------------------------

const PHILOSOPHICAL_TITLES = new Set([
  "The Republic",
  "The Prince",
  "Thus Spoke Zarathustra",
  "The Second Sex",
  "The Analects",
  "Meditations",
  "Beyond Good and Evil",
  "Critique of Pure Reason",
  "Being and Nothingness",
  "The Birth of Tragedy",
]);

// --------------------------------
// 🧠 HYBRID CASES (optional)
// --------------------------------

const HYBRID_PHILOSOPHICAL = new Set([
  "The Bhagavad Gita", // religious + philosophical
]);

// --------------------------------
// 🚀 MAIN
// --------------------------------

(async () => {
  console.log("[PHILOSOPHICAL_TYPE][START]", {
    dryRun: DRY_RUN,
  });

  const snap = await db.collection("books").get();

  let updated = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data();

    const title = data.title;

    if (!title) {
      skipped++;
      continue;
    }

    const isPhilosophical =
      PHILOSOPHICAL_TITLES.has(title) ||
      HYBRID_PHILOSOPHICAL.has(title);

    if (!isPhilosophical) {
      skipped++;
      continue;
    }

    // 🚫 Do not override religious works
    if (data.canonicalType === "religious") {
      console.log("[SKIP][RELIGIOUS]", {
        title,
      });
      skipped++;
      continue;
    }

    // ✅ already philosophical
    if (data.canonicalType === "philosophical") {
      skipped++;
      continue;
    }

    console.log("[UPDATE]", {
      id: doc.id,
      title,
      from: data.canonicalType || null,
      to: "philosophical",
    });

    if (!DRY_RUN) {
      if (!CONFIRM) {
        throw new Error("Missing --confirm=true for write operation");
      }

      await db.collection("books").doc(doc.id).update({
        canonicalType: "philosophical",
        updatedAt: Date.now(),
      });
    }

    updated++;
  }

  console.log("[PHILOSOPHICAL_TYPE][COMPLETE]", {
    total: snap.size,
    updated,
    skipped,
  });

  process.exit();
})();