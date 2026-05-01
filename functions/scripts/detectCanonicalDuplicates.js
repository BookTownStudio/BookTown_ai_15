const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

function normalize(text = "") {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function run() {
  const snap = await db.collection("books").get();

  const map = new Map();

  for (const doc of snap.docs) {
    const b = doc.data();

    const title = normalize(b.title);
    const author = normalize(b.authorCanonicalKey || b.author || "");

    const key = `${title}::${author}`;

    if (!map.has(key)) map.set(key, []);

    map.get(key).push({
      id: doc.id,
      title: b.title,
      author: b.author,
      year: b.publicationYear
    });
  }

  let found = 0;

  for (const [key, arr] of map.entries()) {
    if (arr.length > 1) {
      found++;
      console.log("\nDUPLICATE:", key);
      console.table(arr);
    }
  }

  if (!found) {
    console.log("No exact duplicates found.");
  }
}

run();