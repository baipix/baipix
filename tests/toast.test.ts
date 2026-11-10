import { afterEach, describe, expect, it, vi } from 'vitest';

import { dismissToast, setToastDetailsOpen, toast, toastStore } from '../src/ui/uiStore';

describe('toast details', () => {
  afterEach(() => {
    const current = toastStore.get().toasts[0];
    if (current) dismissToast(current.id);
    vi.useRealTimers();
  });

  it('keeps a toast visible while its details are expanded', () => {
    vi.useFakeTimers();

    toast('Sprite opened with some import adjustments.', undefined, {
      label: 'Details (1)',
      items: ['Unsupported features were skipped.'],
    });

    const notice = toastStore.get().toasts[0];

    expect(notice.detailsOpen).toBe(false);
    setToastDetailsOpen(notice.id, true);

    vi.advanceTimersByTime(20_000);

    expect(toastStore.get().toasts).toHaveLength(1);
    expect(toastStore.get().toasts[0].detailsOpen).toBe(true);

    setToastDetailsOpen(notice.id, false);

    vi.advanceTimersByTime(5999);
    expect(toastStore.get().toasts).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(toastStore.get().toasts).toHaveLength(0);
  });
});
