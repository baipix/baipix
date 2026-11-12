import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  effect: undefined as (() => void) | undefined,
  toast: vi.fn(),
  toastWhenIdle: vi.fn((message: string, beforeShow?: () => boolean) => {
    if (!beforeShow || beforeShow()) harness.toast(message);
  }),
}));

vi.mock('react', () => ({
  useEffect: (effect: () => void) => {
    harness.effect = effect;
  },
}));

vi.mock('../src/ui/uiStore', () => ({
  toast: harness.toast,
  toastWhenIdle: harness.toastWhenIdle,
}));

const { PwaLifecycle } = await import('../src/ui/pwa');

class EventTargetStub {
  private listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type: string): void {
    this.listeners.get(type)?.forEach((listener) => listener());
  }
}

/** Builds the smallest browser surface needed to exercise the worker lifecycle. */
function makeBrowser() {
  const serviceWorker = new EventTargetStub();
  const installing = Object.assign(new EventTargetStub(), {
    state: 'installing',
    postMessage: vi.fn(),
  });
  const registration = Object.assign(new EventTargetStub(), {
    installing,
    waiting: null as ServiceWorker | null,
  });
  const register = vi.fn(async () => registration);
  const reload = vi.fn();

  vi.stubGlobal('navigator', { serviceWorker: { ...serviceWorker, register, controller: null } });
  vi.stubGlobal('window', { location: { reload } });
  vi.stubGlobal('localStorage', {
    value: undefined as string | undefined,
    getItem: vi.fn(function (this: { value?: string }) {
      return this.value ?? null;
    }),
    setItem: vi.fn(function (this: { value?: string }, _key: string, value: string) {
      this.value = value;
    }),
  });

  return { serviceWorker, installing, registration, register, reload };
}

beforeEach(() => {
  harness.effect = undefined;
  harness.toast.mockReset();
  harness.toastWhenIdle.mockClear();
  vi.unstubAllGlobals();
});

describe('PwaLifecycle', () => {
  it('registers the worker and announces offline readiness once after installation', async () => {
    const browser = makeBrowser();
    PwaLifecycle();
    harness.effect?.();
    await Promise.resolve();

    expect(browser.register).toHaveBeenCalledWith('./sw.js', { scope: './' });

    browser.registration.dispatch('updatefound');
    browser.installing.state = 'installed';
    browser.installing.dispatch('statechange');
    // A repeated state notification must not show the one-time toast again.
    browser.installing.dispatch('statechange');

    expect(harness.toast).toHaveBeenCalledTimes(1);
    expect(harness.toast).toHaveBeenCalledWith('Baipix is ready to work offline.');
  });

  it('does not reload while an update is waiting', async () => {
    const browser = makeBrowser();
    const waiting = { postMessage: vi.fn() };
    browser.registration.waiting = waiting as unknown as ServiceWorker;
    vi.stubGlobal('navigator', {
      serviceWorker: {
        register: browser.register,
        controller: {},
        addEventListener: vi.fn(),
      },
    });

    PwaLifecycle();
    harness.effect?.();
    await Promise.resolve();

    expect(harness.toast).toHaveBeenCalledWith(
      'A new version of Baipix is ready.',
      expect.objectContaining({ label: 'Reload' }),
    );
    expect(browser.reload).not.toHaveBeenCalled();
  });

  it('reloads only after the user accepts a waiting update', async () => {
    const browser = makeBrowser();
    const waiting = { postMessage: vi.fn() };
    browser.registration.waiting = waiting as unknown as ServiceWorker;
    vi.stubGlobal('navigator', {
      serviceWorker: {
        register: browser.register,
        controller: {},
        addEventListener: (type: string, listener: () => void) =>
          browser.serviceWorker.addEventListener(type, listener),
      },
    });

    PwaLifecycle();
    harness.effect?.();
    await Promise.resolve();

    const action = harness.toast.mock.calls[0][1] as { run: () => void };
    action.run();

    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(browser.reload).not.toHaveBeenCalled();

    browser.serviceWorker.dispatch('controllerchange');
    expect(browser.reload).toHaveBeenCalledTimes(1);
  });
});
