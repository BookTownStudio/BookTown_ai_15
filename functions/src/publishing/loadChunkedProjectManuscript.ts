import { admin } from "../firebaseAdmin";
import { HttpsError } from "firebase-functions/v2/https";

const MAX_MANUSCRIPT_SECTIONS = 250;
const MAX_CHUNKS_PER_SECTION = 500;
const MANUSCRIPT_SECTION_QUERY_LIMIT = MAX_MANUSCRIPT_SECTIONS + 1;
const MANUSCRIPT_CHUNK_QUERY_LIMIT = MAX_CHUNKS_PER_SECTION + 1;

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
  const sectionsSnap = await projectRef
    .collection("sections")
    .orderBy("order", "asc")
    .limit(MANUSCRIPT_SECTION_QUERY_LIMIT)
    .get();

  if (sectionsSnap.empty) {
    return null;
  }
  if (sectionsSnap.size > MAX_MANUSCRIPT_SECTIONS) {
    throw new HttpsError(
      "failed-precondition",
      `Project manuscript exceeds the maximum supported section count of ${MAX_MANUSCRIPT_SECTIONS}.`
    );
  }

  const chunksBySection = await Promise.all(
    sectionsSnap.docs.map(async (sectionDoc) => {
      const chunksSnap = await sectionDoc.ref
        .collection("chunks")
        .orderBy("order", "asc")
        .limit(MANUSCRIPT_CHUNK_QUERY_LIMIT)
        .get();
      if (chunksSnap.size > MAX_CHUNKS_PER_SECTION) {
        throw new HttpsError(
          "failed-precondition",
          `Project manuscript section exceeds the maximum supported chunk count of ${MAX_CHUNKS_PER_SECTION}.`
        );
      }
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
