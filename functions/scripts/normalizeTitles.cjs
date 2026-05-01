const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

async function run() {
  const updates = [
    {
      id: '6ea2f723-1683-4284-b1f4-c5eb908c2614',
      title: "God's Bits of Wood"
    },
    {
      id: 'b69373f0-de13-4bd0-9563-333523c916a4',
      title: 'The Makioka Sisters'
    }
  ];

  for (const item of updates) {
    const normalized = item.title.toLowerCase();

    await db.collection('books').doc(item.id).update({
      title: item.title,
      canonicalTitle: item.title,
      titleEn: item.title,
      normalizedTitle: normalized,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`Updated: ${item.title}`);
  }

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});