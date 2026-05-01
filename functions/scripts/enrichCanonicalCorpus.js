/**
 * Canonical Enrichment Script (Full Corpus)
 *
 * Purpose:
 * - Enforce canonical authority across all books
 * - Normalize Tier, Language, Tradition, and Locking
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
// 🧠 CONFIG
// -----------------------------

const TIER1_PHILOSOPHY = new Set([
  "The Republic",
  "The Analects",
  "The Bhagavad Gita",
  "Thus Spoke Zarathustra",
  "The Prince",
]);

const TIER1_RELIGIOUS = new Set([
  "The Quran",
  "The Bible",
  "Tanakh",
]);

const LANGUAGE_FIXES = {
  "The Prince": "it",
  "The Republic": "grc",
  "The Analects": "zh",
  "The Bhagavad Gita": "sa",
  "Thus Spoke Zarathustra": "de",
};

const TRADITION_MAP = {
  "The Prince": "political philosophy",
  "The Republic": "philosophy",
  "The Analects": "confucian philosophy",
  "The Bhagavad Gita": "hindu philosophy",
  "Thus Spoke Zarathustra": "philosophy",

  "The Quran": "islamic scripture",
  "The Bible": "christian scripture",
  "Tanakh": "jewish scripture",
};

// -----------------------------
// 🔧 HELPERS
// -----------------------------

function normalizeTitle(title) {
  return (title || "").trim();
}

// -----------------------------
// 🧮 MAIN LOGIC
// -----------------------------

function enrichBook(doc, data) {
  const updates = {};
  const title = normalizeTitle(data.title);

  // -----------------------------
  // 🥇 Tier Enforcement
  // -----------------------------
  if (TIER1_PHILOSOPHY.has(title) || TIER1_RELIGIOUS.has(title)) {
    if (data.canonicalTier !== "Tier1") {
      updates.canonicalTier = "Tier1";
    }

    // Lock Tier1
    if (!data.canonicalLocked) {
      updates.canonicalLocked = true;
    }
  }

  // -----------------------------
  // 🌍 Language Fix
  // -----------------------------
  if (LANGUAGE_FIXES[title]) {
    if (data.originalLanguage !== LANGUAGE_FIXES[title]) {
      updates.originalLanguage = LANGUAGE_FIXES[title];
    }
  }

  // -----------------------------
  // 🧠 Tradition
  // -----------------------------
  if (TRADITION_MAP[title]) {
    if (data.canonicalTradition !== TRADITION_MAP[title]) {
      updates.canonicalTradition = TRADITION_MAP[title];
    }
  }

  // -----------------------------
  // 📚 Type-specific enrichment
  // -----------------------------

  if (data.canonicalType === "religious") {
    // ensure contributors exist
    if (!data.contributors || data.contributors.length === 0) {
      updates.contributors = [
        {
          role: "source",
          name: "Divine Revelation",
        },
      ];
    }
  }

  if (data.canonicalType === "philosophical") {
    // ensure literaryForm exists
    if (!data.literaryForm) {
      updates.literaryForm = "philosophical work";
    }
  }

  return updates;
}

// -----------------------------
// 🚀 RUN
// -----------------------------
(async () => {
  console.log("[ENRICH][START]", { dryRun: DRY_RUN });

  const snap = await db.collection("books").get();

  let updated = 0;
  let unchanged = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const updates = enrichBook(doc, data);

    if (Object.keys(updates).length === 0) {
      unchanged++;
      continue;
    }

    console.log("[ENRICH][UPDATE]", {
      id: doc.id,
      title: data.title,
      updates,
    });

    if (!DRY_RUN) {
      if (!CONFIRM) {
        throw new Error("Missing --confirm=true");
      }

      await doc.ref.update({
        ...updates,
        updatedAt: Date.now(),
      });
    }

    updated++;
  }

  console.log("[ENRICH][COMPLETE]", {
    total: snap.size,
    updated,
    unchanged,
  });

  process.exit();
})();