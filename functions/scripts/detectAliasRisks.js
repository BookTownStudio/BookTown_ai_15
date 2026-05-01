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

function tokenize(text = "") {
  return normalize(text).split(" ").filter(Boolean);
}

function titleSimilarity(a, b) {
  const A = tokenize(a);
  const B = tokenize(b);

  const common = A.filter(word => B.includes(word));

  return common.length / Math.max(A.length, B.length);
}

async function run() {
  const snap = await db.collection("books").get();

  const books = snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));

  let found = 0;

  for (let i = 0; i < books.length; i++) {
    for (let j = i + 1; j < books.length; j++) {
      const a = books[i];
      const b = books[j];

      const sameAuthor =
        normalize(a.authorCanonicalKey || a.author) ===
        normalize(b.authorCanonicalKey || b.author);

      if (!sameAuthor) continue;

      const t1 = normalize(a.title);
      const t2 = normalize(b.title);

      const score = titleSimilarity(t1, t2);

      if (
        t1.includes(t2) ||
        t2.includes(t1) ||
        score >= 0.8
      ) {
        found++;

        console.log("\nPossible alias:");
        console.log(a.title, "↔", b.title);
        console.log("author:", a.author);
        console.log("score:", score.toFixed(2));
      }
    }
  }

  if (!found) {
    console.log("No likely alias risks found.");
  }
}

run();