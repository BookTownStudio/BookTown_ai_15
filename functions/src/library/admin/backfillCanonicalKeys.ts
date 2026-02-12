import { admin } from "../../firebaseAdmin";
import { buildCanonicalKey } from "../persistence/canonicalKey";

const db = admin.firestore();

export async function backfillCanonicalKeys() {
  const booksSnap = await db
    .collection("books")
    .where("canonicalKey", "==", null)
    .get();

  for (const doc of booksSnap.docs) {
    const data = doc.data();

    const canonicalKey = buildCanonicalKey({
      title: data.title,
      author: data.author ?? null,
    });

    await doc.ref.update({ canonicalKey });
  }

  const editionsSnap = await db
    .collection("editions")
    .where("canonicalKey", "==", null)
    .get();

  for (const doc of editionsSnap.docs) {
    const data = doc.data();

    const canonicalKey =
      data.canonicalKey ||
      buildCanonicalKey({
        title: data.titleEn,
        author: data.authorEn ?? null,
      });

    await doc.ref.update({ canonicalKey });
  }
}
