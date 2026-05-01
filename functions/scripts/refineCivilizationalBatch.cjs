const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

async function run() {
  const updates = [
    {
      id: '02b213b5-b866-4805-b414-eea965f9f75e',
      literaryForm: 'memoir',
      description:
        'A classic work of Japanese court literature from the Heian period, combining observation, reflection, anecdote, and personal writing by Sei Shōnagon.'
    },
    {
      id: '5ed5a4b3-6788-413b-923b-db7047f3c4f1',
      literaryForm: 'novel',
      description:
        'One of the great Chinese novels, portraying family life, decline, love, and society in eighteenth-century China through the fortunes of the Jia family.'
    },
    {
      id: '664a89e5-6188-4fb8-bb11-ce039b37d8fc',
      literaryForm: 'novel',
      description:
        'A modernist novel by Elias Canetti exploring obsession, intellectual isolation, and psychological collapse through the life of a reclusive scholar.'
    },
    {
      id: '8a9f4ad6-f2e6-44be-a12f-707533ff6f2a',
      literaryForm: 'novel',
      description:
        'A major modernist novel by Hermann Broch meditating on art, mortality, empire, and the final days of the Roman poet Virgil.'
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