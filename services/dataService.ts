import { DataService } from './db.types.ts';
import { firebaseDbService } from './firebaseDbService.ts';
import { librarySearchService } from './librarySearchService.ts';

const rawService: DataService = firebaseDbService as DataService;

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

console.log('[DataService] Initializing. Mode: FIREBASE (Production Runtime)');

export const dataService: DataService = guardedDataService;
