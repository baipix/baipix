import { afterEach, describe, expect, it, vi } from 'vitest';

import { dismissToast, setToastDetailsOpen, toast, toastStore, toastWhenIdle } from '../src/ui/uiStore';

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

  it('waits for the language toast before showing the offline-ready toast', () => {
    // Show the language notification that can already occupy the single toast slot.
    toast('Language changed to Portuguese.');
    const languageToast = toastStore.get().toasts[0];

    // Queue the offline notification while the language notification is still visible.
    toastWhenIdle('Baipix is ready to work offline.');
    expect(toastStore.get().toasts).toEqual([languageToast]);

    // Dismissing the first notification releases the slot for the queued notification.
    dismissToast(languageToast.id);
    expect(toastStore.get().toasts).toHaveLength(1);
    expect(toastStore.get().toasts[0].message).toBe('Baipix is ready to work offline.');
  });
});
