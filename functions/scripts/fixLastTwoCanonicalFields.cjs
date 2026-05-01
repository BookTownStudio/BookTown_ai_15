const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

async function run() {
  const updates = [
    {
      id: '6ea2f723-1683-4284-b1f4-c5eb908c2614',
      title: "God's Bits of Wood",
      literaryForm: 'novel',
      description:
        "A landmark African novel by Ousmane Sembène portraying a collective railway workers' strike in colonial West Africa and its social, political, and human consequences."
    },
    {
      id: 'b69373f0-de13-4bd0-9563-333523c916a4',
      title: 'The Makioka Sisters',
      canonicalTitle: 'The Makioka Sisters',
      titleEn: 'The Makioka Sisters',
      normalizedTitle: 'the makioka sisters',
      literaryForm: 'novel',
      description:
        "A major modern Japanese novel by Junichiro Tanizaki following four sisters of an aristocratic Osaka family as they navigate tradition, modernity, marriage, and social change."
    }
  ];

  for (const item of updates) {
    const ref = db.collection('books').doc(item.id);

    await ref.update({
      ...item,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`Updated ${item.title}`);
  }

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});