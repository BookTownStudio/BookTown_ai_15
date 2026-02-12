import { DataService } from './db.types.ts';
import { mockDbService } from './mockDbService.ts';
import { firebaseDbService } from './firebaseDbService.ts';
import { librarySearchService } from './librarySearchService.ts';

// Safely access environment variables
const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {} as any;

const forceMock = env.VITE_FORCE_MOCK === 'true';
const hasFirebaseEnv = !!env.VITE_FIREBASE_API_KEY;
const isDemoEnv = typeof window !== 'undefined' && (
    window.location.hostname.includes('aistudio') || 
    window.location.hostname.includes('googleusercontent') ||
    window.location.hostname.includes('run.app')
);

const shouldUseFirebase = hasFirebaseEnv && !forceMock && !isDemoEnv;
const rawService: DataService = shouldUseFirebase ? firebaseDbService : mockDbService;

// Ensure librarySearch is always available as the Bibliographic Source of Truth
rawService.librarySearch = librarySearchService;

/**
 * DATA_SERVICE_DOMAIN_GUARD_V1
 */
const DOMAIN_WHITELIST = [
  "auth", "users", "social", "comments", "books", "attachments", "notifications",
  "search", "projects", "shelves", "catalog", "venues", "messaging", "upload",
  "marketplace", "partner", "librarySearch"
];

const guardedDataService = new Proxy(rawService, {
  get(target, prop) {
    if (typeof prop !== 'string' || !DOMAIN_WHITELIST.includes(prop)) {
      return (target as any)[prop];
    }

    const domainImplementation = (target as any)[prop];

    if (!domainImplementation) {
      return new Proxy({}, {
        get() {
          return () => Promise.resolve([]);
        }
      });
    }

    return domainImplementation;
  }
});

console.log(`[DataService] Initializing. Mode: ${shouldUseFirebase ? 'FIREBASE (Real)' : 'MOCK (Simulated)'}`);

export const dataService: DataService = guardedDataService;