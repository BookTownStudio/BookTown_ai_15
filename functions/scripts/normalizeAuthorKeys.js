const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const fixes = {
  "William Shakespeare": "william shakespeare::1564",
  "Leo Tolstoy": "leo tolstoy::1828",
  "Samuel Beckett": "samuel beckett::1906",
  "Jorge Luis Borges": "jorge luis borges::1899",
  "Ibn Khaldun": "ibn khaldun::1332",
  "Murasaki Shikibu": "murasaki shikibu::973",
  "Homer": "homer::0800bc",
  "Plato": "plato::0428bc",
  "Ferdowsi": "ferdowsi::0940",
  "Mahmoud Darwish": "mahmoud darwish::1941",
  "Abdulrahman Munif": "abdulrahman munif::1933"
};

async function run() {
  const snap = await db.collection("books").get();

  for (const doc of snap.docs) {
    const data = doc.data();
    const fixed = fixes[data.author];

    if (!fixed) continue;

    if (
      !data.authorCanonicalKey ||
      String(data.authorCanonicalKey).includes("unknown")
    ) {
      await doc.ref.update({
        authorCanonicalKey: fixed
      });

      console.log("updated:", data.title, "→", fixed);
    }
  }

  console.log("done");
}

run();