const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

async function run() {
  const updates = [
    {
      id: '2989dcc1-99ce-4702-a238-3a5d41dec210',
      literaryForm: 'novel',
      description:
        'A major Central European novel by Joseph Roth tracing the decline of the Austro-Hungarian Empire through three generations of the Trotta family.'
    },
    {
      id: '53a28011-1bf3-4da7-8222-f82fe64894da',
      literaryForm: 'novel'
    },
    {
      id: '8ef754da-3904-408b-94f3-3fd2d4b92da5',
      literaryForm: 'novel'
    },
    {
      id: '812ea7ac-7ba7-410b-b1b4-6eec796de59f',
      description:
        'One of the great foundational epics of world literature, recounting dynastic conflict, philosophy, war, and moral thought in ancient India.'
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