/**
 * Fix Tier1 Canonical Integrity
 *
 * Actions:
 * - Downgrade weak Tier1 books → Tier2
 * - Remove duplicate Mahabharata (Anonymous)
 * - Enforce strict Tier1 whitelist
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

// -----------------------------------
// ✅ STRICT TIER1 WHITELIST
// -----------------------------------
const STRICT_TIER1 = new Set([
  "The Odyssey",
  "The Iliad",
  "The Aeneid",
  "The Divine Comedy",
  "Don Quixote",
  "Hamlet",
  "Faust",
  "The Republic",
  "The Analects",
  "The Muqaddimah",
  "The Mahabharata",
  "The Bhagavad Gita",
  "The Tale of Genji",
  "Journey to the West",
  "War and Peace",
  "The Brothers Karamazov",
  "Moby-Dick; or, The Whale",
  "The Epic of Gilgamesh",
]);

// -----------------------------------
// ❌ FORCE DOWNGRADE LIST
// -----------------------------------
const FORCE_TIER2 = new Set([
  "Macbeth",
  "Pride and Prejudice",
  "One Hundred Years of Solitude",
]);

// -----------------------------------
// 🧠 MAIN
// -----------------------------------
(async () => {
  console.log("[TIER1_FIX][START]", {
    dryRun: DRY_RUN,
  });

  const snap = await db.collection("books").get();

  let updated = 0;
  let removed = 0;
  let unchanged = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const ref = doc.ref;

    const title = data.title;
    const author = data.author;

    // -----------------------------------
    // 🔴 CASE 1: Remove duplicate Mahabharata
    // -----------------------------------
    if (
      title === "The Mahabharata" &&
      author &&
      author.toLowerCase().includes("anonymous")
    ) {
      console.log("[REMOVE][DUPLICATE]", {
        id: doc.id,
        title,
        author,
      });

      if (!DRY_RUN) {
        if (!CONFIRM) {
          throw new Error("Missing --confirm=true for delete");
        }
        await ref.delete();
      }

      removed++;
      continue;
    }

    // -----------------------------------
    // 🔻 CASE 2: Force downgrade
    // -----------------------------------
    if (FORCE_TIER2.has(title) && data.canonicalTier === "Tier1") {
      console.log("[DOWNGRADE][FORCED]", {
        id: doc.id,
        title,
        from: "Tier1",
        to: "Tier2",
      });

      if (!DRY_RUN) {
        if (!CONFIRM) {
          throw new Error("Missing --confirm=true for write");
        }

        await ref.update({
          canonicalTier: "Tier2",
          updatedAt: Date.now(),
        });
      }

      updated++;
      continue;
    }

    // -----------------------------------
    // 🔒 CASE 3: Enforce strict Tier1 whitelist
    // -----------------------------------
    if (data.canonicalTier === "Tier1") {
      if (!STRICT_TIER1.has(title)) {
        console.log("[DOWNGRADE][WHITELIST]", {
          id: doc.id,
          title,
          from: "Tier1",
          to: "Tier2",
        });

        if (!DRY_RUN) {
          if (!CONFIRM) {
            throw new Error("Missing --confirm=true for write");
          }

          await ref.update({
            canonicalTier: "Tier2",
            updatedAt: Date.now(),
          });
        }

        updated++;
        continue;
      }
    }

    unchanged++;
  }

  console.log("[TIER1_FIX][COMPLETE]", {
    total: snap.size,
    updated,
    removed,
    unchanged,
  });

  process.exit();
})();