const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

async function run() {
  await db.collection('books').doc('34e49911-e45f-4841-a540-834a22583331').update({
    title: 'The Tanners',
    titleOriginal: 'السباخون',
    author: 'Abdelrahman Munif',
    authorCanonicalKey: 'abdelrahman munif::1933',
    literaryForm: 'novel',
    description:
      'A novel by Abdelrahman Munif examining labor, social structure, and transformation in Arab society through a sharply observed collective world.',
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log('Normalized The Tanners');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});