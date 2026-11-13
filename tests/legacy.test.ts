import { afterEach, describe, expect, it, vi } from 'vitest';
import { importLegacyWorkspace } from '../src/io/legacy';

function stubLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  });
  return store;
}

afterEach(() => vi.unstubAllGlobals());

describe('importLegacyWorkspace', () => {
  it('returns no drawings when no legacy data is saved', async () => {
    stubLocalStorage();
    expect(await importLegacyWorkspace()).toEqual([]);
  });

  it('imports the newer files-list shape', async () => {
    stubLocalStorage({
      'baipix:v2': JSON.stringify({
        files: [
          {
            name: 'Hero',
            W: 16,
            H: 16,
            active: 1,
            bg: 0xff112233,
            bgOn: false,
            exportScale: 4,
            exportGap: 1,
            layers: [{ name: 'Base' }, { name: 'Outline', visible: false, opacity: 0.5 }],
          },
          { name: 'Icon', W: 8, H: 8, layers: [{}] },
        ],
      }),
    });

    const docs = await importLegacyWorkspace();
    expect(docs).toHaveLength(2);

    expect(docs[0].name).toBe('Hero');
    expect(docs[0].width).toBe(16);
    expect(docs[0].height).toBe(16);
    expect(docs[0].activeLayer).toBe(1);
    expect(docs[0].background).toBe(0xff112233);
    expect(docs[0].backgroundVisible).toBe(false);
    expect(docs[0].render).toEqual({ pixelSize: 4, gap: 1 });
    expect(docs[0].layers).toHaveLength(2);
    expect(docs[0].layers[0]).toMatchObject({ name: 'Base', visible: true, opacity: 1 });
    expect(docs[0].layers[0].pixels).toHaveLength(16 * 16);
    expect(docs[0].layers[1]).toMatchObject({ name: 'Outline', visible: false, opacity: 0.5 });

    expect(docs[1].name).toBe('Icon');
    expect(docs[1].layers[0].name).toBe('Layer 1');
  });

  it('imports the older single-drawing shape', async () => {
    stubLocalStorage({
      'grain:v1': JSON.stringify({
        name: 'Tile',
        W: 32,
        H: 24,
        prefs: { exportGap: 2 },
        layers: [{ name: 'Ground' }],
      }),
    });

    const docs = await importLegacyWorkspace();
    expect(docs).toHaveLength(1);
    expect(docs[0].name).toBe('Tile');
    expect(docs[0].width).toBe(32);
    expect(docs[0].height).toBe(24);
    expect(docs[0].render).toEqual({ pixelSize: 8, gap: 2 });
    expect(docs[0].layers[0].name).toBe('Ground');
  });

  it('clamps width and height between 1 and 512', async () => {
    stubLocalStorage({
      'baipix:v2': JSON.stringify({
        files: [
          { name: 'Tiny', W: -10, H: 0, layers: [{}] },
          { name: 'Huge', W: 1024, H: 999, layers: [{}] },
        ],
      }),
    });

    const docs = await importLegacyWorkspace();
    expect(docs).toHaveLength(2);
    expect(docs[0].width).toBe(1);
    expect(docs[0].height).toBe(1);
    expect(docs[0].layers[0].pixels).toHaveLength(1);

    expect(docs[1].width).toBe(512);
    expect(docs[1].height).toBe(512);
    expect(docs[1].layers[0].pixels).toHaveLength(512 * 512);
  });

  it('skips a broken entry and tries the next legacy key', async () => {
    stubLocalStorage({
      'baipix:v2': '{broken json',
      'pixma:v2': JSON.stringify({
        name: 'Rescued',
        W: 12,
        H: 12,
        layers: [{ name: 'Ink' }],
      }),
    });

    const docs = await importLegacyWorkspace();
    expect(docs).toHaveLength(1);
    expect(docs[0].name).toBe('Rescued');
  });

  it('removes all legacy keys once imported', async () => {
    const store = stubLocalStorage({
      'baipix:v2': JSON.stringify({ name: 'Saved', W: 8, H: 8, layers: [{}] }),
      'pixma:v2': '{"old":true}',
      'grain:v1': '{"older":true}',
      other: 'keep',
    });

    const docs = await importLegacyWorkspace();
    expect(docs).toHaveLength(1);
    expect(store.has('baipix:v2')).toBe(false);
    expect(store.has('pixma:v2')).toBe(false);
    expect(store.has('grain:v1')).toBe(false);
    expect(store.get('other')).toBe('keep');
  });
});
