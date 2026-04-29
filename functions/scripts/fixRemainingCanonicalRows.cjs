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