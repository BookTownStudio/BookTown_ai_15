import { getFunctions, httpsCallable } from 'firebase/functions';
import { MediaService } from '../lib/media/mediaService.ts';
import { FirebaseStorageAdapter } from '../lib/media/storageAdapter.ts';
import { UploadCategory, UploadDataService } from './db.types.ts';
import { AttachmentMetadataV1, AttachmentTypeV1, AttachmentV1 } from '../types/entities.ts';

type PendingUpload = {
  attachmentId: string;
  token: string;
  uploadUrl: string;
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

type CallableEnvelope<T> =
  | T
  | {
      success: boolean;
      data?: T;
      error?: {
        code?: string;
        message?: string;
        details?: unknown;
      };
    };

type UploadIntentResponse = {
  token: string;
  uploadUrl: string;
  attachmentId: string;
  storagePath: string;
  fileName?: string;
  purpose: string;
  format: string;
  type: AttachmentTypeV1;
};

const DIRECT_UPLOAD_GUARD_ERROR = 'DIRECT_STORAGE_UPLOAD_DISABLED_USE_SIGNED_INTENT';

const isLegacyAttachmentPath = (value: string): boolean => {
  const normalized = value.trim();
  return normalized.startsWith('users/') && normalized.includes('/attachments/');
};

const assertNoLegacyAttachmentPath = (value: string): void => {
  if (isLegacyAttachmentPath(value)) {
    throw new Error(DIRECT_UPLOAD_GUARD_ERROR);
  }
};

const extractPathFromLegacyStorageUrl = (uploadUrl: string): string => {
  try {
    const parsed = new URL(uploadUrl);
    if (!parsed.hostname.includes('firebasestorage.googleapis.com')) {
      return '';
    }
    const encodedName = parsed.searchParams.get('name');
    if (!encodedName) {
      return '';
    }
    try {
      return decodeURIComponent(encodedName);
    } catch {
      return encodedName;
    }
  } catch {
    return '';
  }
};

const unwrapCallableData = <T>(raw: unknown): T => {
  if (raw && typeof raw === 'object' && 'success' in (raw as Record<string, unknown>)) {
    const envelope = raw as CallableEnvelope<T> & {
      success: boolean;
      data?: T;
      error?: { message?: string };
    };

    if (envelope.success !== true) {
      throw new Error(envelope.error?.message || 'Callable request failed.');
    }
    if (typeof envelope.data === 'undefined') {
      throw new Error('Callable response missing data.');
    }
    return envelope.data;
  }

  return raw as T;
};

export class FirebaseUploadService implements UploadDataService {
  async getUploadToken(
    uid: string,
    parentType: string,
    parentId: string,
    type: AttachmentTypeV1,
    fileName: string,
    contentType?: string,
    size?: number
  ) {
    if (!uid) throw new Error('UNAUTHENTICATED');
    if (type !== 'IMAGE' && type !== 'DOCUMENT') {
      throw new Error('Unsupported attachment type.');
    }

    const functions = getFunctions();
    const getUploadTokenFn = httpsCallable(functions, 'getUploadToken');
    const result = await getUploadTokenFn({
      parentType,
      parentId,
      type,
      fileName,
      ...(contentType ? { contentType } : {}),
      ...(typeof size === 'number' ? { size } : {})
    });

    const intent = unwrapCallableData<UploadIntentResponse>(result.data);
    if (!intent?.attachmentId || !intent?.uploadUrl || !intent?.storagePath || !intent?.token) {
      throw new Error('Invalid upload intent response.');
    }
    assertNoLegacyAttachmentPath(intent.storagePath);
    const legacyPathFromUrl = extractPathFromLegacyStorageUrl(intent.uploadUrl);
    if (legacyPathFromUrl) {
      assertNoLegacyAttachmentPath(legacyPathFromUrl);
    }

    pendingUploads.set(intent.attachmentId, {
      attachmentId: intent.attachmentId,
      token: intent.token,
      uploadUrl: intent.uploadUrl,
      storagePath: intent.storagePath,
      purpose: intent.purpose,
      format: intent.format,
      type: intent.type,
      fileName: intent.fileName || fileName
    });

    return {
      token: intent.token,
      uploadUrl: intent.uploadUrl,
      attachmentId: intent.attachmentId
    };
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

    const pending = Array.from(pendingUploads.values()).find((entry) => entry.uploadUrl === path);
    if (!pending) {
      throw new Error('Upload intent not found.');
    }
    assertNoLegacyAttachmentPath(pending.storagePath);
    const legacyPathFromUrl = extractPathFromLegacyStorageUrl(path);
    if (legacyPathFromUrl) {
      assertNoLegacyAttachmentPath(legacyPathFromUrl);
    }

    const mimeType = (file as File).type || 'application/octet-stream';
    if (pending.type === 'IMAGE' && !mimeType.startsWith('image/')) {
      throw new Error('Only image files are supported for IMAGE attachments.');
    }
    if (pending.type === 'DOCUMENT' && mimeType !== 'application/pdf') {
      throw new Error('Only PDF files are supported for DOCUMENT attachments.');
    }

    const uploadResponse = await fetch(path, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType
      },
      body: file
    });

    if (!uploadResponse.ok) {
      throw new Error(`Signed upload failed with status ${uploadResponse.status}.`);
    }

    pending.mimeType = mimeType;
    pending.size = file.size;
    pendingUploads.set(pending.attachmentId, pending);

    return pending.storagePath;
  }

  async finalizeMetadata(
    uid: string,
    parentType: string,
    parentId: string,
    attachmentId: string,
    token: string
  ): Promise<AttachmentV1> {
    if (!uid) throw new Error('UNAUTHENTICATED');

    const pending = pendingUploads.get(attachmentId);
    if (!pending || pending.token !== token) {
      throw new Error('Invalid upload intent token.');
    }

    const functions = getFunctions();
    const finalizeFn = httpsCallable(functions, 'finalizeMetadata');
    const finalizeResult = await finalizeFn({
      attachmentId,
      parentType,
      parentId,
      purpose: pending.purpose,
      format: pending.format,
      storagePath: pending.storagePath
    });
    unwrapCallableData<{ ok: boolean; attachmentId: string }>(finalizeResult.data);

    const metadata: AttachmentMetadataV1 = {
      attachmentId,
      type: pending.type,
      mimeType: pending?.mimeType || 'application/octet-stream',
      size: pending?.size || 0,
      createdAt: new Date().toISOString(),
      uploader: { uid },
      storagePath: pending.storagePath,
      parentId,
      parentType
    };

    const payload =
      pending.type === 'DOCUMENT'
        ? { name: pending.fileName, size: pending.size || 0 }
        : {};

    pendingUploads.delete(attachmentId);

    return {
      attachmentId,
      type: pending.type,
      metadata,
      payload,
      immutable: true
    };
  }
}
