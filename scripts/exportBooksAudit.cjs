const admin = require("../functions/node_modules/firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function run() {
  const snap = await db
    .collection("books")
    .where("authorityStatus", "==", "canonical")
    .get();

  const rows = snap.docs
    .map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        title: data.title || null,
        author: data.author || null,
        authorCanonicalKey: data.authorCanonicalKey || null,
        authorityStatus: data.authorityStatus || null,
        language: data.language || null,
        publicationYear: data.publicationYear || null,
        literaryForm: data.literaryForm || null,
        description: data.description || data.descriptionEn || data.abstractDescription || null,
        descriptionSource: data.descriptionSource || null,
        descriptionAuthority: data.descriptionAuthority ?? null,
        needsEnrichment: data.needsEnrichment ?? null,
        canonicalLocked: data.canonicalLocked === true,
        providers: data.acquiredFromProvider || null,
      };
    })
    .sort((a, b) => {
      const titleCompare = String(a.title || "").localeCompare(String(b.title || ""));
      if (titleCompare !== 0) return titleCompare;
      const authorCompare = String(a.author || "").localeCompare(String(b.author || ""));
      if (authorCompare !== 0) return authorCompare;
      return a.id.localeCompare(b.id);
    });

  console.log(JSON.stringify(rows, null, 2));
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await admin.app().delete();
  });
