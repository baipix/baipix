import type { StoredHistory } from './history';
import { fromStored, toStored, type StorageAdapter, type StoredWorkspace, type Workspace } from './workspace';

const DB_NAME = 'baipix';
const STORE = 'workspace';
const KEY = 'current';
const HISTORY_KEY = 'history';

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = op(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Local persistence in the browser. No size limit in practice, unlike localStorage. */
export class IndexedDbStorage implements StorageAdapter {
  private db: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory = indexedDB) {}

  private connect(): Promise<IDBDatabase> {
    this.db ??= openDb(this.factory);
    return this.db;
  }

  async load(): Promise<Workspace | null> {
    const db = await this.connect();
    const stored = await run<StoredWorkspace | undefined>(db, 'readonly', (s) => s.get(KEY));
    return stored ? fromStored(stored) : null;
  }

  async save(workspace: Workspace): Promise<void> {
    const db = await this.connect();
    await run(db, 'readwrite', (s) => s.put(toStored(workspace), KEY));
  }

  async loadHistory(): Promise<StoredHistory | null> {
    const db = await this.connect();
    return (await run<StoredHistory | undefined>(db, 'readonly', (s) => s.get(HISTORY_KEY))) ?? null;
  }

  async saveHistory(history: StoredHistory): Promise<void> {
    const db = await this.connect();
    await run(db, 'readwrite', (s) => s.put(history, HISTORY_KEY));
  }
}
