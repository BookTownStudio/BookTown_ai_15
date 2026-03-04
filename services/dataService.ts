import { devLog } from '../lib/logging/devLog';
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

const domainProxyCache = new Map<string, any>();

const guardedDataService = new Proxy(rawService, {
  get(target, prop) {
    if (typeof prop !== 'string' || !DOMAIN_WHITELIST.includes(prop)) {
      return (target as any)[prop];
    }

    const domainImplementation = (target as any)[prop];

    if (!domainImplementation) {
      throw new Error(`[DataService] Missing domain implementation: ${prop}`);
    }

    if (domainProxyCache.has(prop)) {
      return domainProxyCache.get(prop);
    }

    const guardedDomain = new Proxy(domainImplementation, {
      get(domainTarget, methodName) {
        if (typeof methodName === 'symbol') {
          return (domainTarget as any)[methodName];
        }
        const method = (domainTarget as any)[methodName];
        if (typeof methodName === 'string' && !(methodName in (domainTarget as any))) {
          throw new Error(
            `[DataService] Missing method implementation: ${prop}.${String(methodName)}`
          );
        }
        if (typeof method !== 'function') return method;
        return method.bind(domainTarget);
      }
    });

    domainProxyCache.set(prop, guardedDomain);
    return guardedDomain;
  }
});

devLog('[DataService] Initializing. Mode: FIREBASE (Production Runtime)');

export const dataService: DataService = guardedDataService;
