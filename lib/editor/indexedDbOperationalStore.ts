import { type WriteOperationalRecord, type WriteOperationStatus } from './writeOperationalTypes.ts';

const DB_NAME = 'booktown_write_operational_sync';
const DB_VERSION = 1;
const OPERATION_STORE = 'operations';
const META_STORE = 'meta';
const SEQUENCE_KEY = 'operationSequence';
const DEFAULT_APPLIED_RETENTION = 200;

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new Error('IndexedDB is not available in this runtime.'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OPERATION_STORE)) {
        const operations = db.createObjectStore(OPERATION_STORE, { keyPath: 'operationId' });
        operations.createIndex('byProjectStatus', ['uid', 'projectId', 'status'], { unique: false });
        operations.createIndex('byProjectSequence', ['uid', 'projectId', 'sequence'], { unique: false });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open write operational IndexedDB.'));
  });
}

async function withStore<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  run: (transaction: IDBTransaction) => Promise<T>
): Promise<T> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(storeNames, mode);
    const result = await run(transaction);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    });
    return result;
  } finally {
    db.close();
  }
}

async function nextSequence(): Promise<number> {
  return withStore([META_STORE], 'readwrite', async (transaction) => {
    const store = transaction.objectStore(META_STORE);
    const current = await requestToPromise<{ key: string; value: number } | undefined>(
      store.get(SEQUENCE_KEY)
    );
    const value = (current?.value ?? 0) + 1;
    await requestToPromise(store.put({ key: SEQUENCE_KEY, value }));
    return value;
  });
}

export const indexedDbOperationalStore = {
  async allocateSequence(): Promise<number> {
    return nextSequence();
  },

  async get(operationId: string): Promise<WriteOperationalRecord | null> {
    return withStore(OPERATION_STORE, 'readonly', async (transaction) => {
      const result = await requestToPromise<WriteOperationalRecord | undefined>(
        transaction.objectStore(OPERATION_STORE).get(operationId)
      );
      return result ?? null;
    });
  },

  async put(record: WriteOperationalRecord): Promise<void> {
    await withStore(OPERATION_STORE, 'readwrite', async (transaction) => {
      await requestToPromise(transaction.objectStore(OPERATION_STORE).put(record));
    });
  },

  async getPending(uid: string, projectId: string): Promise<WriteOperationalRecord[]> {
    return withStore(OPERATION_STORE, 'readonly', async (transaction) => {
      const store = transaction.objectStore(OPERATION_STORE);
      const byStatus = store.index('byProjectStatus');
      const pending = await requestToPromise<WriteOperationalRecord[]>(
        byStatus.getAll(IDBKeyRange.only([uid, projectId, 'pending']))
      );
      const failed = await requestToPromise<WriteOperationalRecord[]>(
        byStatus.getAll(IDBKeyRange.only([uid, projectId, 'failed']))
      );
      return [...pending, ...failed]
        .sort((a, b) => a.sequence - b.sequence || a.createdAt - b.createdAt);
    });
  },

  async countPending(uid: string, projectId: string): Promise<number> {
    return (await this.getPending(uid, projectId)).length;
  },

  async countForProject(uid: string, projectId: string): Promise<number> {
    return withStore(OPERATION_STORE, 'readonly', async (transaction) => {
      const records = await requestToPromise<WriteOperationalRecord[]>(
        transaction.objectStore(OPERATION_STORE).index('byProjectSequence').getAll(
          IDBKeyRange.bound([uid, projectId, 0], [uid, projectId, Number.MAX_SAFE_INTEGER])
        )
      );
      return records.length;
    });
  },

  async compactApplied(params: {
    uid: string;
    projectId: string;
    retain?: number;
    preserveOperationIds?: string[];
  }): Promise<{ beforeCount: number; afterCount: number; prunedCount: number }> {
    const retain = Math.max(25, params.retain ?? DEFAULT_APPLIED_RETENTION);
    const preserveOperationIds = new Set(params.preserveOperationIds ?? []);
    return withStore(OPERATION_STORE, 'readwrite', async (transaction) => {
      const store = transaction.objectStore(OPERATION_STORE);
      const records = await requestToPromise<WriteOperationalRecord[]>(
        store.index('byProjectSequence').getAll(
          IDBKeyRange.bound([params.uid, params.projectId, 0], [params.uid, params.projectId, Number.MAX_SAFE_INTEGER])
        )
      );
      const applied = records
        .filter((record) => record.status === 'applied')
        .sort((a, b) => (
          (b.appliedAt ?? b.updatedAt) - (a.appliedAt ?? a.updatedAt) ||
          b.sequence - a.sequence
        ));
      const retained = new Set(applied.slice(0, retain).map((record) => record.operationId));
      let prunedCount = 0;
      for (const record of applied.slice(retain)) {
        if (preserveOperationIds.has(record.operationId) || retained.has(record.operationId)) {
          continue;
        }
        await requestToPromise(store.delete(record.operationId));
        prunedCount += 1;
      }
      return {
        beforeCount: records.length,
        afterCount: records.length - prunedCount,
        prunedCount,
      };
    });
  },

  async setProjectMeta(uid: string, projectId: string, key: string, value: unknown): Promise<void> {
    await withStore(META_STORE, 'readwrite', async (transaction) => {
      await requestToPromise(transaction.objectStore(META_STORE).put({
        key: `${uid}:${projectId}:${key}`,
        value,
        updatedAt: Date.now(),
      }));
    });
  },

  async getProjectMeta<T>(uid: string, projectId: string, key: string): Promise<T | null> {
    return withStore(META_STORE, 'readonly', async (transaction) => {
      const result = await requestToPromise<{ value: T } | undefined>(
        transaction.objectStore(META_STORE).get(`${uid}:${projectId}:${key}`)
      );
      return result?.value ?? null;
    });
  },

  async updateStatus(
    operationId: string,
    status: WriteOperationStatus,
    patch: Partial<WriteOperationalRecord> = {}
  ): Promise<void> {
    const existing = await this.get(operationId);
    if (!existing) {
      return;
    }

    await this.put({
      ...existing,
      ...patch,
      status,
      updatedAt: Date.now(),
    });
  },
};
