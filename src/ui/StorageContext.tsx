import { createContext, useContext } from 'react';
import type { StorageAdapter } from '../storage/workspace';
import { createStore } from './store';

export const StorageContext = createContext<StorageAdapter | null>(null);

export function useStorage(): StorageAdapter {
  const storage = useContext(StorageContext);
  if (!storage) throw new Error('useStorage must be used inside <StorageContext.Provider>');
  return storage;
}

/** The deleted files kept by the storage, for the home screen; read again after each save. */
export const trashStore = createStore<{ files: import('../storage/workspace').TrashedFile[] }>({ files: [] });

export function refreshTrash(storage: StorageAdapter): void {
  storage
    .listTrash?.()
    .then((files) => trashStore.set({ files }))
    .catch(() => {
      /* nothing to list */
    });
}
