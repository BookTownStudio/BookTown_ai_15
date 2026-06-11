import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import { getFirebaseStorage } from '../firebase.ts';

const INTERNAL_BOOK_COVER_PATH_RE = /^books\/[^/]+\/covers\/[^?#]+$/i;
const resolvedInternalCoverUrlCache = new Map<string, string>();
const missingInternalCoverPathCache = new Set<string>();

export function extractInternalBookCoverPath(candidate: string): string {
  const normalized = candidate.trim();
  if (!normalized) return '';

  if (INTERNAL_BOOK_COVER_PATH_RE.test(normalized)) {
    return normalized;
  }

  try {
    const parsed = new URL(normalized);

    if (parsed.hostname === 'storage.googleapis.com') {
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (segments.length >= 4 && segments[1] === 'books') {
        const path = segments.slice(1).join('/');
        return INTERNAL_BOOK_COVER_PATH_RE.test(path) ? path : '';
      }
      if (segments.length >= 3 && segments[0] === 'books') {
        const path = segments.join('/');
        return INTERNAL_BOOK_COVER_PATH_RE.test(path) ? path : '';
      }
      return '';
    }

    if (parsed.hostname === 'firebasestorage.googleapis.com') {
      const marker = '/o/';
      const markerIndex = parsed.pathname.indexOf(marker);
      if (markerIndex === -1) return '';

      const encodedObjectPath = parsed.pathname.slice(markerIndex + marker.length);
      const objectPath = decodeURIComponent(encodedObjectPath);
      return INTERNAL_BOOK_COVER_PATH_RE.test(objectPath) ? objectPath : '';
    }
  } catch {
    return '';
  }

  return '';
}

export function normalizeExternalCoverUrl(candidate: string): string {
  const normalized = candidate.trim();
  if (!normalized || extractInternalBookCoverPath(normalized)) return '';

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

export async function resolveCoverImageUrl(candidate: string): Promise<string> {
  const normalized = candidate.trim();
  if (!normalized) return '';

  const externalUrl = normalizeExternalCoverUrl(normalized);
  if (externalUrl) return externalUrl;

  const internalPath = extractInternalBookCoverPath(normalized);
  if (!internalPath || missingInternalCoverPathCache.has(internalPath)) return '';

  const cached = resolvedInternalCoverUrlCache.get(internalPath);
  if (cached) return cached;

  try {
    const url = await getDownloadURL(storageRef(getFirebaseStorage(), internalPath));
    resolvedInternalCoverUrlCache.set(internalPath, url);
    return url;
  } catch {
    missingInternalCoverPathCache.add(internalPath);
    return '';
  }
}
