import { httpsCallable } from "firebase/functions";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getFirebaseDb, getFirebaseFunctions, getFirebaseStorage } from "../lib/firebase.ts";
import { Project, PublishedBook, WriteContentDoc } from "../types/entities.ts";
import type { ProjectDataService } from "./db.types.ts";

type FailureEnvelope = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

type SuccessEnvelope<T> = {
  success: true;
  data: T;
};

type ProjectStatus = "Idea" | "Draft" | "Revision" | "Final";
type WriteUpdateResult = { projectId: string; revision: number; updatedAt: string };
type WriteShareLinkResult = {
  projectId: string;
  token: string;
  shareUrl: string;
  isRevoked: boolean;
  createdAt: string;
  updatedAt: string;
};

function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof (value as { toDate?: unknown })?.toDate === "function") {
    return ((value as { toDate: () => Date }).toDate()).toISOString();
  }
  if (typeof value === "string" && value.trim()) return value;
  return new Date().toISOString();
}

function normalizeStatus(value: unknown): ProjectStatus {
  if (value === "Idea" || value === "Draft" || value === "Revision" || value === "Final") {
    return value;
  }
  return "Draft";
}

function normalizeBoundedString(value: unknown, fallback: string, max: number): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.slice(0, max);
}

function normalizeProjectDoc(projectId: string, payload: Record<string, unknown>): Project {
  const titleEn =
    typeof payload.titleEn === "string" && payload.titleEn.trim()
      ? payload.titleEn.trim()
      : "Untitled Project";

  const titleAr =
    typeof payload.titleAr === "string" && payload.titleAr.trim()
      ? payload.titleAr.trim()
      : "مشروع غير معنون";

  return {
    id: projectId,
    title: typeof payload.title === "string" ? payload.title : titleEn,
    titleEn,
    titleAr,
    typeEn: typeof payload.typeEn === "string" && payload.typeEn.trim() ? payload.typeEn.trim() : "Draft",
    typeAr: typeof payload.typeAr === "string" && payload.typeAr.trim() ? payload.typeAr.trim() : "مسودة",
    status: normalizeStatus(payload.status),
    wordCount:
      typeof payload.wordCount === "number" && Number.isFinite(payload.wordCount)
        ? Math.max(0, Math.floor(payload.wordCount))
        : 0,
    updatedAt: toIso(payload.updatedAt),
    createdAt: toIso(payload.createdAt),
    content: typeof payload.content === "string" ? payload.content : "",
    contentDoc: isWriteContentDoc(payload.contentDoc) ? (payload.contentDoc as WriteContentDoc) : undefined,
    isPublished: payload.isPublished === true,
    publishedBookId:
      typeof payload.publishedBookId === "string" && payload.publishedBookId.trim()
        ? payload.publishedBookId.trim()
        : undefined,
    revision:
      typeof payload.revision === "number" && Number.isInteger(payload.revision) && payload.revision > 0
        ? payload.revision
        : 1,
    coverUrl:
      typeof payload.coverUrl === "string" && payload.coverUrl.trim()
        ? payload.coverUrl.trim()
        : undefined,
  };
}

function isWriteContentDoc(value: unknown): value is WriteContentDoc {
  if (!value || typeof value !== "object") return false;
  const doc = value as Record<string, unknown>;
  return doc.type === "doc" && doc.version === 1 && Array.isArray(doc.content);
}

function sanitizeContentDoc(value: unknown): WriteContentDoc | undefined {
  if (!isWriteContentDoc(value)) {
    return undefined;
  }

  const serialized = JSON.stringify(value);
  if (serialized.length > 2_000_000) {
    throw new Error("contentDoc exceeds maximum allowed size.");
  }

  return JSON.parse(serialized) as WriteContentDoc;
}

function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`[firebaseProjectService] ${field} must be a non-empty string.`);
  }
  return value.trim();
}

function extractSuccessData<T>(endpoint: string, payload: unknown): T {
  if (!payload || typeof payload !== "object") {
    throw new Error(`[${endpoint}] Invalid callable response envelope.`);
  }

  const envelope = payload as Partial<SuccessEnvelope<T>> & Partial<FailureEnvelope> & {
    success?: boolean;
  };

  if (envelope.success === false && envelope.error) {
    const code = assertNonEmptyString(envelope.error.code, `${endpoint}.error.code`);
    const message = assertNonEmptyString(envelope.error.message, `${endpoint}.error.message`);
    throw new Error(`[${code}] ${message}`);
  }

  if (envelope.success !== true || !("data" in envelope)) {
    throw new Error(`[${endpoint}] Missing success envelope data.`);
  }

  return envelope.data as T;
}

async function callEndpoint<TRequest, TData>(
  endpoint: string,
  request: TRequest
): Promise<TData> {
  const fn = httpsCallable<TRequest, SuccessEnvelope<TData> | FailureEnvelope>(
    getFirebaseFunctions(),
    endpoint
  );
  const result = await fn(request);
  return extractSuccessData<TData>(endpoint, result.data);
}

function isRevisionMismatchError(error: unknown): boolean {
  if (!(error instanceof Error) || typeof error.message !== "string") {
    return false;
  }
  return error.message.includes("[FAILED_PRECONDITION]") && error.message.includes("Revision mismatch");
}

function sanitizeWriteUpdates(input: Partial<Project>): {
  titleEn?: string;
  titleAr?: string;
  content?: string;
  contentDoc?: WriteContentDoc;
  wordCount?: number;
  status?: ProjectStatus;
  typeEn?: string;
  typeAr?: string;
  coverUrl?: string;
} {
  const updates: {
    titleEn?: string;
    titleAr?: string;
    content?: string;
    contentDoc?: WriteContentDoc;
    wordCount?: number;
    status?: ProjectStatus;
    typeEn?: string;
    typeAr?: string;
    coverUrl?: string;
  } = {};

  if (typeof input.titleEn === "string" && input.titleEn.trim()) {
    updates.titleEn = input.titleEn.trim().slice(0, 180);
  }
  if (typeof input.titleAr === "string" && input.titleAr.trim()) {
    updates.titleAr = input.titleAr.trim().slice(0, 180);
  }
  if (typeof input.content === "string") {
    updates.content = input.content.slice(0, 2_000_000);
  }
  if (input.contentDoc !== undefined) {
    const normalizedDoc = sanitizeContentDoc(input.contentDoc);
    if (normalizedDoc) {
      updates.contentDoc = normalizedDoc;
    }
  }
  if (typeof input.wordCount === "number" && Number.isFinite(input.wordCount) && input.wordCount >= 0) {
    updates.wordCount = Math.floor(input.wordCount);
  }
  if (input.status === "Idea" || input.status === "Draft" || input.status === "Revision" || input.status === "Final") {
    updates.status = input.status;
  }
  if (typeof input.typeEn === "string" && input.typeEn.trim()) {
    updates.typeEn = input.typeEn.trim().slice(0, 80);
  }
  if (typeof input.typeAr === "string" && input.typeAr.trim()) {
    updates.typeAr = input.typeAr.trim().slice(0, 80);
  }
  if (typeof input.coverUrl === "string" && input.coverUrl.trim()) {
    try {
      const parsed = new URL(input.coverUrl.trim());
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        updates.coverUrl = parsed.toString().slice(0, 2048);
      }
    } catch {
      // ignore invalid cover URL values
    }
  }

  return updates;
}

function createOperationId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export const firebaseProjectService: ProjectDataService = {
  async getProjects(uid: string): Promise<Project[]> {
    const db = getFirebaseDb();
    const projectQuery = query(
      collection(db, "users", uid, "projects"),
      orderBy("updatedAt", "desc")
    );
    const snapshot = await getDocs(projectQuery);
    return snapshot.docs.map((projectDoc) =>
      normalizeProjectDoc(projectDoc.id, projectDoc.data() as Record<string, unknown>)
    );
  },

  async getProject(uid: string, projectId: string): Promise<Project> {
    const db = getFirebaseDb();
    const projectRef = doc(db, "users", uid, "projects", projectId);
    const snap = await getDoc(projectRef);
    if (!snap.exists()) {
      throw new Error("Project not found");
    }
    return normalizeProjectDoc(snap.id, snap.data() as Record<string, unknown>);
  },

  async createProject(
    uid: string,
    project: Omit<Project, "id" | "updatedAt" | "createdAt">
  ): Promise<Project> {
    const payload = {
      titleEn: normalizeBoundedString(project.titleEn, "Untitled Project", 180),
      titleAr: normalizeBoundedString(project.titleAr, "مشروع غير معنون", 180),
      content: typeof project.content === "string" ? project.content.slice(0, 2_000_000) : "",
      contentDoc: sanitizeContentDoc(project.contentDoc),
      wordCount: typeof project.wordCount === "number" ? Math.max(0, Math.floor(project.wordCount)) : 0,
      status: normalizeStatus(project.status),
      typeEn: normalizeBoundedString(project.typeEn, "Draft", 80),
      typeAr: normalizeBoundedString(project.typeAr, "مسودة", 80),
    };

    const created = await callEndpoint<
      { project: typeof payload },
      {
        id: string;
        title?: string;
        titleEn: string;
        titleAr: string;
        typeEn: string;
        typeAr: string;
        status: ProjectStatus;
        wordCount: number;
        content: string;
        contentDoc?: WriteContentDoc;
        isPublished: boolean;
        createdAt: string;
        updatedAt: string;
        revision: number;
        publishedBookId?: string;
        coverUrl?: string;
      }
    >("createWriteProject", { project: payload });

    return normalizeProjectDoc(created.id, created as unknown as Record<string, unknown>);
  },

  async updateProject(
    uid: string,
    projectId: string,
    updates: Partial<Project>
  ): Promise<WriteUpdateResult> {
    const sanitized = sanitizeWriteUpdates(updates);
    if (Object.keys(sanitized).length === 0) {
      throw new Error("No writable fields were provided.");
    }

    const invokeUpdate = async (expectedRevision: number) =>
      callEndpoint<
        {
          projectId: string;
          expectedRevision: number;
          updates: typeof sanitized;
        },
        WriteUpdateResult
      >("updateWriteProject", {
        projectId,
        expectedRevision,
        updates: sanitized,
      });

    const current = await this.getProject(uid, projectId);
    try {
      return await invokeUpdate(current.revision);
    } catch (error) {
      if (!isRevisionMismatchError(error)) {
        throw error;
      }
      const latest = await this.getProject(uid, projectId);
      return invokeUpdate(latest.revision);
    }
  },

  async duplicateProject(_uid: string, projectId: string): Promise<Project> {
    const duplicated = await callEndpoint<
      { projectId: string; operationId: string },
      Record<string, unknown>
    >("duplicateWriteProject", {
      projectId,
      operationId: createOperationId("dup"),
    });

    const id = assertNonEmptyString(duplicated.id, "duplicateWriteProject.id");
    return normalizeProjectDoc(id, duplicated);
  },

  async deleteProject(_uid: string, projectId: string): Promise<void> {
    await callEndpoint<{ projectId: string }, { success: boolean }>("deleteWriteProject", {
      projectId,
    });
  },

  async createShareLink(
    _uid: string,
    projectId: string,
    origin?: string
  ): Promise<WriteShareLinkResult> {
    return callEndpoint<
      { projectId: string; origin?: string },
      WriteShareLinkResult
    >("createWriteProjectShareLink", {
      projectId,
      origin,
    });
  },

  async revokeShareLink(
    _uid: string,
    projectId: string
  ): Promise<{ projectId: string; revoked: boolean; revokedAt: string | null }> {
    return callEndpoint<
      { projectId: string },
      { projectId: string; revoked: boolean; revokedAt: string | null }
    >("revokeWriteProjectShareLink", {
      projectId,
    });
  },

  async stageBookFiles(
    uid: string,
    projectId: string,
    files: { epub: Blob; pdf: Blob }
  ): Promise<{ epubUrl: string; pdfUrl: string }> {
    await this.getProject(uid, projectId);

    if (!(files.epub instanceof Blob) || files.epub.size === 0) {
      throw new Error("EPUB file is required.");
    }
    if (!(files.pdf instanceof Blob) || files.pdf.size === 0) {
      throw new Error("PDF file is required.");
    }

    const storage = getFirebaseStorage();
    const epubPath = `projects/${uid}/${projectId}/exports/${Date.now()}_draft.epub`;
    const pdfPath = `projects/${uid}/${projectId}/exports/${Date.now()}_draft.pdf`;

    await uploadBytes(ref(storage, epubPath), files.epub, { contentType: "application/epub+zip" });
    await uploadBytes(ref(storage, pdfPath), files.pdf, { contentType: "application/pdf" });

    const [epubUrl, pdfUrl] = await Promise.all([
      getDownloadURL(ref(storage, epubPath)),
      getDownloadURL(ref(storage, pdfPath)),
    ]);

    return { epubUrl, pdfUrl };
  },

  async publishBook(
    _uid: string,
    projectId: string,
    metadata: { title: string; description: string; coverUrl?: string },
    files: { epubUrl: string; pdfUrl: string }
  ): Promise<PublishedBook> {
    const normalizedTitle = metadata.title.trim().slice(0, 180);
    if (!normalizedTitle) {
      throw new Error("Title is required to publish.");
    }
    const normalizedDescription = metadata.description.trim().slice(0, 4000);
    const coverUrl =
      typeof metadata.coverUrl === "string" && metadata.coverUrl.trim()
        ? metadata.coverUrl.trim().slice(0, 2048)
        : undefined;

    return callEndpoint<
      {
        projectId: string;
        operationId: string;
        metadata: { title: string; description: string; coverUrl?: string };
        files: { epubUrl: string; pdfUrl: string };
      },
      PublishedBook
    >("publishWriteProject", {
      projectId,
      operationId: createOperationId("pub"),
      metadata: {
        title: normalizedTitle,
        description: normalizedDescription,
        coverUrl,
      },
      files,
    });
  },
};
