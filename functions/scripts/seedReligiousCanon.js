const admin = require("firebase-admin");

const DRY_RUN = process.argv.includes("--dry-run=false") ? false : true;
const CONFIRM = process.argv.includes("--confirm=true");

admin.initializeApp();
const db = admin.firestore();

const BOOKS = [
  {
    title: "The Quran",
    author: "Various",
    canonicalTier: "Tier1",
    canonicalLocked: true,
    canonicalTradition: "Islamic",
    originalLanguage: "Arabic",
    literaryForm: "Religious Text",
    canonicalFingerprint: "the quran",
    contributors: [
      { role: "source", label: "Revelation" },
      { role: "conveyed_by", name: "Prophet Muhammad" }
    ],
    attributionNote: "Revealed to Prophet Muhammad"
  },
  {
    title: "The Bible",
    author: "Various",
    canonicalTier: "Tier1",
    canonicalLocked: true,
    canonicalTradition: "Christian",
    originalLanguage: "Hebrew/Greek",
    literaryForm: "Religious Text",
    canonicalFingerprint: "the bible",
    contributors: [
      { role: "compiled_by", label: "Various authors" }
    ],
    attributionNote: "Canonical Christian scripture"
  },
  {
    title: "Tanakh",
    author: "Various",
    canonicalTier: "Tier1",
    canonicalLocked: true,
    canonicalTradition: "Jewish",
    originalLanguage: "Hebrew",
    literaryForm: "Religious Text",
    canonicalFingerprint: "tanakh",
    contributors: [
      { role: "compiled_by", label: "Various authors" }
    ],
    attributionNote: "Hebrew Bible (Torah, Nevi'im, Ketuvim)"
  }
];

(async () => {
  console.log("[RELIGIOUS_SEED][START]", { dryRun: DRY_RUN });

  let created = 0;
  let skipped = 0;

  for (const book of BOOKS) {
    const existing = await db
      .collection("books")
      .where("canonicalFingerprint", "==", book.canonicalFingerprint)
      .limit(1)
      .get();

    if (!existing.empty) {
      console.log("[SKIP]", book.title);
      skipped++;
      continue;
    }

    console.log("[CREATE]", book.title);

    if (!DRY_RUN) {
      if (!CONFIRM) {
        throw new Error("Missing --confirm=true");
      }

      await db.collection("books").add({
        ...book,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    created++;
  }

  console.log("[RELIGIOUS_SEED][COMPLETE]", {
    created,
    skipped
  });

  process.exit();
})();