import { devInfo } from './devLog';
const LOCAL_STORAGE_DEBUG_KEY = 'booktown.debug.bookEngineV2';

function isDebugEnabled(): boolean {
  try {
    if (typeof window === 'undefined') {
      return false;
    }

    if (import.meta.env.DEV) {
      return true;
    }

    return window.localStorage.getItem(LOCAL_STORAGE_DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

export function logBookEngineV2(
  event: string,
  payload: Record<string, unknown>
): void {
  if (!isDebugEnabled()) {
    return;
  }

  devInfo(event, payload);
}
