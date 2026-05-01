const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

async function run() {
  const updates = [
    {
      id: '678c1ca9-f025-45b4-89c4-08254e41cfdd',
      literaryForm: 'novel'
    },
    {
      id: '7e855873-c53b-4b41-8fa2-0d52d944ba2f',
      literaryForm: 'novel'
    }
  ];

  for (const item of updates) {
    await db.collection('books').doc(item.id).update({
      ...item,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`Updated ${item.id}`);
  }

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});