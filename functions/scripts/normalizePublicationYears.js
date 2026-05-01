const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// SAFE CANONICAL YEARS MAP (extendable)
const YEARS = {
  "the odyssey": -700,
  "the iliad": -750,
  "the analects": -400,
  "the republic": -380,
  "the shahnameh": 1010,
  "the tale of genji": 1008,
  "the pillow book": 1002,
  "the divine comedy": 1320,
  "the canterbury tales": 1400,
  "the prince": 1532,
  "hamlet": 1603,
  "macbeth": 1606,
  "don quixote": 1605,
  "faust": 1808,
  "faust part two": 1832,
  "madame bovary": 1856,
  "crime and punishment": 1866,
  "war and peace": 1869,
  "anna karenina": 1878,
  "the brothers karamazov": 1880,
  "the trial": 1925,
  "the magic mountain": 1924,
  "mrs dalloway": 1925,
  "the sound and the fury": 1929,
  "as i lay dying": 1930,
  "the stranger": 1942,
  "the plague": 1947,
  "the aleph": 1945,
  "invisible man": 1952,
  "things fall apart": 1958,
  "midnight's children": 1981,
  "beloved": 1987
};

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

  for (const doc of snap.docs) {
    const data = doc.data();

    if (data.publicationYear) continue;

    const key = normalize(data.title);

    if (YEARS[key] !== undefined) {
      await doc.ref.update({
        publicationYear: YEARS[key]
      });

      console.log("updated:", data.title, "→", YEARS[key]);
    }
  }

  console.log("publicationYear normalization complete.");
}

run();