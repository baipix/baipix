import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { keepStorage, resetKeepStorage } from '../src/storage/keepStorage';

function stubStorage(persisted: boolean) {
  const storage = {
    persisted: vi.fn(async () => persisted),
    persist: vi.fn(async () => true),
  };
  vi.stubGlobal('navigator', { storage });
  return storage;
}

beforeEach(() => resetKeepStorage());
afterEach(() => vi.unstubAllGlobals());

describe('keepStorage', () => {
  it('asks the browser to keep the storage, once per tab', async () => {
    const storage = stubStorage(false);
    await keepStorage();
    await keepStorage();
    expect(storage.persist).toHaveBeenCalledTimes(1);
  });

  it("doesn't ask again when the storage is already kept", async () => {
    const storage = stubStorage(true);
    await keepStorage();
    expect(storage.persist).not.toHaveBeenCalled();
  });

  it('does nothing in a browser without the API, or when it throws', async () => {
    vi.stubGlobal('navigator', {});
    await expect(keepStorage()).resolves.toBeUndefined();
    resetKeepStorage();
    vi.stubGlobal('navigator', { storage: { persist: () => Promise.reject(new Error('denied')) } });
    await expect(keepStorage()).resolves.toBeUndefined();
  });
});
