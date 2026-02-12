import { getFunctions, httpsCallable } from 'firebase/functions';
import { ref, uploadBytes } from 'firebase/storage';
import { getFirebaseStorage } from '../lib/firebase.ts';
import { MediaService } from '../lib/media/mediaService.ts';
import { FirebaseStorageAdapter } from '../lib/media/storageAdapter.ts';
import { UploadCategory, UploadDataService } from './db.types.ts';
import { AttachmentMetadataV1, AttachmentTypeV1, AttachmentV1 } from '../types/entities.ts';

type PendingUpload = {
  attachmentId: string;
  storagePath: string;
  purpose: string;
  format: string;
  type: AttachmentTypeV1;
  fileName: string;
  mimeType?: string;
  size?: number;
};

const pendingUploads = new Map<string, PendingUpload>();
const mediaService = new MediaService(new FirebaseStorageAdapter());

const safeFileName = (name: string) =>
  name
    .split('/')
    .pop()
    ?.replace(/[^a-zA-Z0-9._-]/g, '_') || 'upload';

const inferFormat = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ext && ext.length <= 6 ? ext : 'bin';
};

const makeId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `att_${crypto.randomUUID()}`;
  }
  return `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const encodeToken = (payload: Record<string, any>) =>
  btoa(JSON.stringify(payload));

const decodeToken = (token: string) => {
  try {
    return JSON.parse(atob(token));
  } catch {
    return null;
  }
};

const extractAttachmentId = (path: string) => {
  const parts = path.split('/');
  const attachmentsIndex = parts.indexOf('attachments');
  if (attachmentsIndex !== -1 && parts[attachmentsIndex + 1]) {
    const candidate = parts[attachmentsIndex + 1];
    return candidate.includes('.') ? candidate.split('.')[0] : candidate;
  }
  return null;
};

export class FirebaseUploadService implements UploadDataService {
  async getUploadToken(
    uid: string,
    parentType: string,
    parentId: string,
    type: AttachmentTypeV1,
    fileName: string
  ) {
    if (!uid) throw new Error('UNAUTHENTICATED');

    const attachmentId = makeId();
    const safeName = safeFileName(fileName);
    const format = inferFormat(safeName);
    const purpose = type.toLowerCase();

    let storagePath = '';

    if (type === 'IMAGE') {
      storagePath = `users/${uid}/attachments/${attachmentId}/${safeName}`;
    } else if (type === 'DOCUMENT') {
      if (format !== 'pdf') {
        throw new Error('Only PDF documents are supported.');
      }
      storagePath = `attachments/${uid}/${attachmentId}.pdf`;
    } else {
      throw new Error('Unsupported attachment type.');
    }

    pendingUploads.set(attachmentId, {
      attachmentId,
      storagePath,
      purpose,
      format,
      type,
      fileName: safeName
    });

    const token = encodeToken({
      attachmentId,
      storagePath,
      purpose,
      format,
      type,
      parentType,
      parentId
    });

    return { token, uploadUrl: storagePath, attachmentId };
  }

  async uploadImage(
    uid: string,
    category: UploadCategory,
    file: File,
    id?: string
  ): Promise<string> {
    if (!uid) throw new Error('UNAUTHENTICATED');
    return mediaService.uploadMedia(uid, file, { category, id });
  }

  async uploadFile(uid: string, path: string, file: Blob): Promise<string> {
    if (!uid) throw new Error('UNAUTHENTICATED');

    if (!(file instanceof Blob) || file.size === 0) {
      throw new Error('Empty file rejected.');
    }

    const mimeType = (file as File).type || 'application/octet-stream';
    if (path.startsWith('users/') && !mimeType.startsWith('image/')) {
      throw new Error('Only image files are supported.');
    }
    if (path.startsWith('attachments/') && mimeType !== 'application/pdf') {
      throw new Error('Only PDF files are supported.');
    }

    const attachmentId = extractAttachmentId(path);
    if (attachmentId) {
      const pending = pendingUploads.get(attachmentId);
      if (pending) {
        pending.mimeType = mimeType;
        pending.size = file.size;
        pendingUploads.set(attachmentId, pending);
      }
    }

    const storage = getFirebaseStorage();
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    return path;
  }

  async finalizeMetadata(
    uid: string,
    parentType: string,
    parentId: string,
    attachmentId: string,
    token: string
  ): Promise<AttachmentV1> {
    if (!uid) throw new Error('UNAUTHENTICATED');

    const tokenData = decodeToken(token);
    if (!tokenData || tokenData.attachmentId !== attachmentId) {
      throw new Error('Invalid upload token.');
    }

    const pending = pendingUploads.get(attachmentId);
    const purpose = tokenData.purpose as string;
    const format = tokenData.format as string;
    const storagePath = tokenData.storagePath as string;

    const functions = getFunctions();
    const finalizeFn = httpsCallable(functions, 'finalizeMetadata');

    await finalizeFn({
      attachmentId,
      parentType,
      parentId,
      purpose,
      format,
      storagePath
    });

    const metadata: AttachmentMetadataV1 = {
      attachmentId,
      type: tokenData.type as AttachmentTypeV1,
      mimeType: pending?.mimeType || 'application/octet-stream',
      size: pending?.size || 0,
      createdAt: new Date().toISOString(),
      uploader: { uid },
      storagePath,
      parentId,
      parentType
    };

    const payload =
      tokenData.type === 'DOCUMENT'
        ? { name: pending?.fileName || tokenData.fileName, size: pending?.size || 0 }
        : {};

    pendingUploads.delete(attachmentId);

    return {
      attachmentId,
      type: tokenData.type as AttachmentTypeV1,
      metadata,
      payload,
      immutable: true
    };
  }
}
