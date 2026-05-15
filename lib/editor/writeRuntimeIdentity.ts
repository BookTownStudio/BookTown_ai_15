import { createWriteOperationHash } from './writeOperationalTypes.ts';

const DEVICE_ID_KEY = 'booktown_write_device_id';

function createFallbackDeviceId(uid: string): string {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'non_browser_runtime';
  return `device_${createWriteOperationHash({ uid, userAgent })}`;
}

export function getWriteRuntimeDeviceId(uid: string): string {
  if (typeof localStorage === 'undefined') {
    return createFallbackDeviceId(uid);
  }

  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const generated = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `device_${crypto.randomUUID()}`
      : createFallbackDeviceId(uid);
    localStorage.setItem(DEVICE_ID_KEY, generated);
    return generated;
  } catch {
    return createFallbackDeviceId(uid);
  }
}
