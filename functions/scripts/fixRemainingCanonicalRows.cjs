const admin = require("firebase-admin");
const serviceAccount = require("../../scripts/serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const fixes = [
  {
    title: "The Muqaddimah",
    literaryForm: "historical philosophy",
    description:
      "The Muqaddimah introduces Ibn Khaldun's theory of society, history, power, labor, and civilizational rise and decline.",
  },
  {
    title: "The Bhagavad Gita",
    literaryForm: "philosophy",
    description:
      "The Bhagavad Gita presents a dialogue on duty, action, devotion, knowledge, and liberation on the battlefield of Kurukshetra.",
  },
  {
    title: "The Mahabharata",
    literaryForm: "epic",
    description:
      "The Mahabharata follows dynastic conflict, exile, war, and moral struggle across one of the largest epic traditions in world literature.",
  },
  {
    title: "The Prince",
    literaryForm: "political philosophy",
    description:
      "The Prince examines political power, statecraft, force, prudence, and rule under unstable historical conditions.",
  },
  {
    title: "Faust Part Two",
    literaryForm: "drama",
    description:
      "Faust Part Two expands Faust's journey through empire, myth, ambition, and redemption across political and symbolic worlds.",
  },
  {
    title: "The Aeneid",
    description:
      "The Aeneid follows Aeneas from Troy to Italy, joining exile, war, prophecy, and imperial destiny in Rome's foundational epic.",
  },
  {
  title: "The Waste Land",
  description:
    "The Waste Land gathers fractured voices, cultural fragments, and ritual echoes to examine spiritual exhaustion, historical rupture, and modern consciousness.",
    },
    {
    title: "Divan of Hafez",
    description:
        "The Divan of Hafez gathers lyric poems of love, longing, divine beauty, irony, and mystical reflection in Persian poetic tradition.",
    },
    {
      title: "The Conference of the Birds",
      description:
        "The Conference of the Birds follows birds seeking the Simorgh through trials of desire, loss, self-knowledge, and mystical transformation.",
    },
    {
      title: "The Tale of Kieu",
      description:
        "The Tale of Kieu follows Thuy Kieu through sacrifice, separation, injustice, and endurance in a major work of Vietnamese poetic tradition.",
    },
    {
      title: "Their Eyes Were Watching God",
      description:
        "Their Eyes Were Watching God follows Janie Crawford through love, voice, independence, and self-realization across changing stages of her life.",
    },
    {
      title: "The Epic of Gilgamesh",
      description:
        "The Epic of Gilgamesh follows friendship, kingship, grief, and the search for mortality's meaning in one of humanity's earliest epics.",
    },
];

(async () => {
  for (const fix of fixes) {
    const snap = await db.collection("books").where("title", "==", fix.title).get();
    for (const doc of snap.docs) {
      await doc.ref.update(fix);
      console.log("updated", fix.title);
    }
  }
  process.exit(0);
})();