import { beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.fn();
vi.mock('../src/ui/uiStore', () => ({ toast }));

const { openFromUrl } = await import('../src/ui/openFromUrl');

beforeEach(() => {
  toast.mockReset();
  vi.stubGlobal('location', {
    href: 'https://baipix.app/app/?open=/gallery/sunset.baipix',
    origin: 'https://baipix.app',
    pathname: '/app/',
    search: '?open=/gallery/sunset.baipix',
    hash: '',
  });
  vi.stubGlobal('history', { replaceState: vi.fn() });
});

describe('openFromUrl', () => {
  it('reports a clear error when a gallery example cannot be fetched offline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('offline'))),
    );

    await expect(openFromUrl({ addDocuments: vi.fn() } as never)).resolves.toBe(false);
    expect(toast).toHaveBeenCalledWith('This example cannot be opened without a connection.');
  });

  it('keeps the invalid-file error for a fetched file with invalid contents', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, text: async () => '{"not":"a baipix file"}' })),
    );

    await expect(openFromUrl({ addDocuments: vi.fn() } as never)).resolves.toBe(false);
    expect(toast).toHaveBeenCalledWith('This is not a valid .baipix file.');
  });
});
