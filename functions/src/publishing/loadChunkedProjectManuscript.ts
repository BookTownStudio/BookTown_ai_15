import { admin } from "../firebaseAdmin";

type WriteContentDoc = {
  version: 1;
  type: "doc";
  content: Array<Record<string, unknown>>;
};

type ChunkRecord = {
  sectionId: string;
  order: number;
  contentDoc: WriteContentDoc;
};

function isContentDoc(value: unknown): value is WriteContentDoc {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const doc = value as Record<string, unknown>;
  return doc.version === 1 && doc.type === "doc" && Array.isArray(doc.content);
}

export async function loadChunkedProjectManuscript(params: {
  uid: string;
  projectId: string;
}): Promise<WriteContentDoc | null> {
  const db = admin.firestore();
  const projectRef = db
    .collection("users")
    .doc(params.uid)
    .collection("projects")
    .doc(params.projectId);
  const sectionsSnap = await projectRef.collection("sections").orderBy("order", "asc").get();

  if (sectionsSnap.empty) {
    return null;
  }

  const chunksBySection = await Promise.all(
    sectionsSnap.docs.map(async (sectionDoc) => {
      const chunksSnap = await sectionDoc.ref.collection("chunks").orderBy("order", "asc").get();
      return chunksSnap.docs
        .map((chunkDoc) => {
          const data = chunkDoc.data() as Record<string, unknown>;
          const contentDoc = data.contentDoc;
          if (!isContentDoc(contentDoc)) {
            return null;
          }
          return {
            sectionId: sectionDoc.id,
            order: typeof data.order === "number" ? data.order : 0,
            contentDoc,
          } satisfies ChunkRecord;
        })
        .filter((chunk): chunk is ChunkRecord => chunk !== null);
    })
  );

  const chunks = chunksBySection.flat();
  if (chunks.length === 0) {
    return null;
  }

  return {
    version: 1,
    type: "doc",
    content: chunks.flatMap((chunk) => chunk.contentDoc.content),
  };
}
