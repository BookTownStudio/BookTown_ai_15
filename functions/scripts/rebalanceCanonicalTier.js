/**
 * Rebalance canonical tiers for BookTown corpus
 *
 * Rules:
 * - Tier1: civilizational / foundational works (strict whitelist)
 * - Tier2: major literary works
 * - Tier3: everything else
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
// 🔧 Helpers (non-breaking)
// -----------------------------
function normalize(str) {
  return (str || "").toLowerCase().trim();
}

// -----------------------------
// 🔒 TIER1 WHITELIST (EXPANDED)
// -----------------------------
const TIER1_TITLES = new Set([
  "The Odyssey",
  "The Iliad",
  "Hamlet",
  "Macbeth",
  "King Lear",
  "Don Quixote",
  "The Divine Comedy",
  "The Mahabharata",
  "The Bhagavad Gita",
  "The Shahnameh",
  "The Epic of Gilgamesh",
  "The Aeneid",
  "The Republic",
  "The Analects",
  "The Tale of Genji",
  "War and Peace",
  "Pride and Prejudice",
  "The Brothers Karamazov",
  "Moby-Dick; or, The Whale",
  "One Hundred Years of Solitude",
  "The Canterbury Tales",
  "Faust",
  "Journey to the West",
  "The Muqaddimah",
]);

// normalized version for safer matching
const TIER1_NORMALIZED = new Set([...TIER1_TITLES].map(normalize));

// -----------------------------
// 🧠 Tier2 Author Intelligence (NEW)
// -----------------------------
const TIER2_AUTHORS = new Set([
  "Franz Kafka",
  "Albert Camus",
  "Gabriel Garcia Marquez",
  "Jorge Luis Borges",
  "Naguib Mahfouz",
  "Virginia Woolf",
  "James Joyce",
  "William Faulkner",
  "Toni Morrison",
  "José Saramago",
  "Clarice Lispector",
  "Chinua Achebe",
  "Tayeb Salih",
]);

const TIER2_AUTHORS_NORMALIZED = new Set([...TIER2_AUTHORS].map(normalize));

// -----------------------------
// 🧠 Optional Tier2 signals (KEPT)
// -----------------------------
function isTier2(book) {
  if (!book.publicationYear) return false;

  // modern classics (rough heuristic)
  if (book.publicationYear >= 1850 && book.publicationYear <= 2000) {
    return true;
  }

  return false;
}

// -----------------------------
// 🧮 Decide new tier (UPGRADED)
// -----------------------------
function decideTier(book) {
  const title = normalize(book.title);
  const author = normalize(book.author);

  // Tier1 → strict civilizational anchors
  if (TIER1_NORMALIZED.has(title)) {
    return "Tier1";
  }

  // Tier2 → strong literary authors
  if (TIER2_AUTHORS_NORMALIZED.has(author)) {
    return "Tier2";
  }

  // Tier2 → fallback heuristic (KEPT)
  if (isTier2(book)) {
    return "Tier2";
  }

  return "Tier3";
}

// -----------------------------
// 🚀 MAIN
// -----------------------------
(async () => {
  console.log("[REBALANCE][START]", {
    dryRun: DRY_RUN,
  });

  const snap = await db.collection("books").get();

  let updated = 0;
  let unchanged = 0;

  for (const doc of snap.docs) {
    const data = doc.data();

    const newTier = decideTier(data);
    const currentTier = data.canonicalTier;

    if (currentTier === newTier) {
      unchanged++;
      continue;
    }

    console.log("[REBALANCE][CHANGE]", {
      id: doc.id,
      title: data.title,
      from: currentTier,
      to: newTier,
    });

    if (!DRY_RUN) {
      if (!CONFIRM) {
        throw new Error("Missing --confirm=true for write operation");
      }

      await db.collection("books").doc(doc.id).update({
        canonicalTier: newTier,
        updatedAt: Date.now(),
      });
    }

    updated++;
  }

  console.log("[REBALANCE][COMPLETE]", {
    total: snap.size,
    updated,
    unchanged,
  });

  process.exit();
})();