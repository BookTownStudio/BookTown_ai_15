import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

type Row = {
  bookId: string;
  title: string;
  author: string;
  form: string;
};

async function run() {
  const snapshot = await db.collection("books").get();

  const rows: Row[] = [];

  snapshot.forEach((doc) => {
    const data = doc.data();

    const title =
      data.canonicalTitle ||
      data.title ||
      "";

    const author =
      (data.authorNames && data.authorNames.join(", ")) ||
      data.author ||
      "";

    const form =
      data?.ontology?.form ||
      data?.literaryForm ||
      "";

    rows.push({
      bookId: doc.id,
      title,
      author,
      form,
    });
  });

  // Sort for readability
  rows.sort((a, b) => a.title.localeCompare(b.title));

  // Output clean format
  console.log("\nBOOK EXPORT:\n");

  rows.forEach((r) => {
    console.log(
      `${r.bookId} | ${r.title} | ${r.author} | ${r.form}`
    );
  });

  console.log(`\nTotal: ${rows.length} books\n`);
}

run().then(() => process.exit());