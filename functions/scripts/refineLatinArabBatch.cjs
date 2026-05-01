const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

async function run() {
  const updates = [
    {
      id: '0bd04333-9e8d-4ffd-b2b0-3d72ac2da573',
      literaryForm: 'novel'
    },
    {
      id: '2e08cf55-aecc-4c25-9564-3d0983ac560a',
      literaryForm: 'nonfiction'
    },
    {
      id: '5c753c8a-8af2-42af-bd9c-83899f1b2f4e',
      literaryForm: 'novel',
      description:
        'A short existential novel by Ernesto Sabato following a painter whose obsessive love and jealousy drive him toward psychological collapse and crime.'
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