const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

function normalizeTitle(text = "") {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const authorFixes = {
  "abdelrahman munif::1933": "abdulrahman munif::1933",
  "abdul rahman munif::unknown": "abdulrahman munif::1933",
  "cao xueqin::unknown": "cao xueqin::1717",
  "gabriel garcia marquez::unknown": "gabriel garcia marquez::1927",
  "virginia woolf::unknown": "virginia woolf::1882",
  "naguib mahfouz::unknown": "naguib mahfouz::1911",
  "ismail kadare::unknown": "ismail kadare::1936",
  "johann wolfgang von goethe::1825": "johann wolfgang von goethe::1749"
};

function buildFingerprint(book, authorCanonicalKey) {
  const title = normalizeTitle(book.title || "");
  return `${title}::${authorCanonicalKey}`;
}

async function run() {
  const snap = await db.collection("books").get();

  let updated = 0;

  for (const doc of snap.docs) {
    const data = doc.data();

    const current = String(data.authorCanonicalKey || "").trim();
    const fixed = authorFixes[current];

    if (!fixed) continue;

    await doc.ref.update({
      authorCanonicalKey: fixed,
      canonicalFingerprint: buildFingerprint(data, fixed)
    });

    updated++;

    console.log(
      "updated:",
      data.title,
      "|",
      current,
      "→",
      fixed
    );
  }

  console.log("\nDone");
  console.log("updated:", updated);
}

run();