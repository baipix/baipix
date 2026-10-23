import type { BoardHistory } from '../engine/editor';
import type { PixelDoc } from '../engine/document';
import { packHistories, unpackHistories, type StoredHistory } from './history';
import {
  fromStored,
  readStoredFile,
  storeFile,
  type StorageAdapter,
  type StoredFile,
  type StoredWorkspace,
  type Workspace,
} from './workspace';

const DB_NAME = 'baipix';
/** Version 1 kept the whole workspace as one record; version 2 keeps one record per board. */
const DB_VERSION = 2;
/** Version 1's store: the workspace under `current`, the histories under `history`. */
const LEGACY_STORE = 'workspace';
const LEGACY_KEY = 'current';
/** One record per board, by its id. */
const FILES = 'files';
/** The rest of the workspace: the active board, the preferences, the UI settings. */
const META = 'meta';
const META_KEY = 'current';
/** One record per board's undo history, by its id. */
const HISTORIES = 'histories';

interface Meta {
  activeId: string;
  preferences: Workspace['preferences'];
  ui: Workspace['ui'];
}

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of [LEGACY_STORE, FILES, META, HISTORIES])
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Runs `ops` in one transaction over `stores`, resolving once it's done. */
function transact<T>(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  ops: (tx: IDBTransaction) => IDBRequest<T> | void,
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const req = ops(tx);
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const all = <T>(store: IDBObjectStore) => store.getAll() as IDBRequest<T[]>;

/**
 * Local persistence in the browser. No size limit in practice, unlike localStorage.
 *
 * Each board is its own record, and a save only writes the boards that changed since this tab
 * loaded or saved them, and only removes the boards this tab removed: with Baipix open in two tabs,
 * neither can wipe what the other drew, which one record for the whole workspace let happen.
 * `changedElsewhere` gives the boards another tab added or changed, to show them here too.
 */
export class IndexedDbStorage implements StorageAdapter {
  private db: Promise<IDBDatabase> | null = null;
  /** The boards this tab holds, as last loaded or saved here: id → `updatedAt`. */
  private known = new Map<string, number>();
  private knownHistories = new Set<string>();

  constructor(private readonly factory: IDBFactory = indexedDB) {}

  private connect(): Promise<IDBDatabase> {
    this.db ??= openDb(this.factory);
    return this.db;
  }

  async load(): Promise<Workspace | null> {
    const db = await this.connect();
    await this.migrate(db);
    const files =
      (await transact(db, [FILES], 'readonly', (tx) => all<StoredFile>(tx.objectStore(FILES)))) ?? [];
    const meta = await transact(
      db,
      [META],
      'readonly',
      (tx) => tx.objectStore(META).get(META_KEY) as IDBRequest<Meta | undefined>,
    );
    const workspace = fromStored({
      version: 1,
      files,
      activeId: meta?.activeId ?? '',
      preferences: meta?.preferences ?? {},
      ui: meta?.ui ?? {},
    });
    this.known.clear();
    for (const doc of workspace?.documents ?? []) this.known.set(doc.id, doc.updatedAt ?? 0);
    return workspace;
  }

  /**
   * A version 1 database: its one record becomes a record per board, and stays as a backup. Once
   * there's a version 2 record (the meta one, written by every save), it's done.
   */
  private async migrate(db: IDBDatabase): Promise<void> {
    const meta = await transact(db, [META], 'readonly', (tx) => tx.objectStore(META).get(META_KEY));
    if (meta) return;
    const legacy = await transact(
      db,
      [LEGACY_STORE],
      'readonly',
      (tx) => tx.objectStore(LEGACY_STORE).get(LEGACY_KEY) as IDBRequest<StoredWorkspace | undefined>,
    );
    if (!legacy?.files?.length) return;
    await transact(db, [FILES, META], 'readwrite', (tx) => {
      for (const f of legacy.files) if (f.id) tx.objectStore(FILES).put(f, f.id);
      const meta: Meta = {
        activeId: legacy.activeId,
        preferences: legacy.preferences ?? {},
        ui: legacy.ui ?? {},
      };
      tx.objectStore(META).put(meta, META_KEY);
    });
  }

  async save(workspace: Workspace): Promise<void> {
    const db = await this.connect();
    const ids = new Set(workspace.documents.map((d) => d.id));
    const changed = workspace.documents.filter((d) => this.known.get(d.id) !== (d.updatedAt ?? 0));
    const removed = [...this.known.keys()].filter((id) => !ids.has(id));
    const meta: Meta = { activeId: workspace.activeId, preferences: workspace.preferences, ui: workspace.ui };
    await transact(db, [FILES, META], 'readwrite', (tx) => {
      const files = tx.objectStore(FILES);
      for (const doc of changed) files.put(storeFile(doc), doc.id);
      for (const id of removed) files.delete(id);
      tx.objectStore(META).put(meta, META_KEY);
    });
    for (const doc of changed) this.known.set(doc.id, doc.updatedAt ?? 0);
    for (const id of removed) this.known.delete(id);
  }

  /**
   * The boards another tab added or changed since this one loaded or saved them (never the ones
   * this tab changed itself). They count as known from then on.
   */
  async changedElsewhere(): Promise<PixelDoc[]> {
    const db = await this.connect();
    const files =
      (await transact(db, [FILES], 'readonly', (tx) => all<StoredFile>(tx.objectStore(FILES)))) ?? [];
    const docs: PixelDoc[] = [];
    for (const f of files) {
      if (!f.id) continue;
      const known = this.known.get(f.id);
      const at = typeof f.updatedAt === 'number' ? f.updatedAt : 0;
      if (known !== undefined && known >= at) continue;
      const doc = readStoredFile(f);
      if (!doc) continue;
      this.known.set(doc.id, doc.updatedAt ?? 0);
      docs.push(doc);
    }
    return docs;
  }

  async loadHistory(): Promise<BoardHistory[]> {
    const db = await this.connect();
    const stored =
      (await transact(db, [HISTORIES], 'readonly', (tx) => all<StoredHistory>(tx.objectStore(HISTORIES)))) ??
      [];
    const histories = stored.flatMap((h) => unpackHistories(h));
    this.knownHistories = new Set(histories.map((h) => h.id));
    return histories;
  }

  /** Each board's history as its own record; a board gone from `histories` loses its record. */
  async saveHistory(histories: BoardHistory[]): Promise<void> {
    const db = await this.connect();
    const ids = new Set(histories.map((h) => h.id));
    const removed = [...this.knownHistories].filter((id) => !ids.has(id));
    await transact(db, [HISTORIES], 'readwrite', (tx) => {
      const store = tx.objectStore(HISTORIES);
      for (const h of histories) store.put(packHistories([h]), h.id);
      for (const id of removed) store.delete(id);
    });
    this.knownHistories = ids;
  }
}
