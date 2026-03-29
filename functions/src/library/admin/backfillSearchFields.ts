import { admin } from "../../firebaseAdmin";
import {
  buildBookSearchPatch,
  buildEditionSearchPatch,
} from "../search/searchIndexing";

export async function backfillSearchFields(batchSize = 500): Promise<void> {
  const db = admin.firestore();
  const targets: Array<{
    collection: "books" | "editions";
    buildPatch: (data: Record<string, unknown>) => Record<string, unknown>;
  }> = [
    { collection: "books", buildPatch: buildBookSearchPatch },
    { collection: "editions", buildPatch: buildEditionSearchPatch },
  ];

  for (const target of targets) {
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    while (true) {
      let query = db.collection(target.collection).orderBy("__name__").limit(batchSize);
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snap = await query.get();
      if (snap.empty) break;

      const batch = db.batch();

      for (const doc of snap.docs) {
        const data = doc.data() as Record<string, unknown>;
        batch.set(doc.ref, target.buildPatch(data), { merge: true });
      }

      await batch.commit();
      lastDoc = snap.docs[snap.docs.length - 1];
    }
  }
}
