import { useEffect } from 'react';

import { t } from '../i18n';
import { toast, toastWhenIdle } from './uiStore';

const OFFLINE_READY_KEY = 'baipix.offlineReady';
const watchedRegistrations = new WeakSet<ServiceWorkerRegistration>();

type FlushAutosave = () => Promise<boolean>;

function showOfflineReady(): void {
  toastWhenIdle(t('toast.offlineReady'), () => {
    try {
      if (localStorage.getItem(OFFLINE_READY_KEY)) return false;

      localStorage.setItem(OFFLINE_READY_KEY, '1');
      return true;
    } catch {
      return false;
    }
  });
}

async function reloadWithUpdate(
  registration: ServiceWorkerRegistration,
  flushAutosave: FlushAutosave,
): Promise<void> {
  const waiting = registration.waiting;
  if (!waiting) return;

  if (!(await flushAutosave())) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
    once: true,
  });
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

function showUpdateReady(registration: ServiceWorkerRegistration, flushAutosave: FlushAutosave): void {
  toast(t('toast.updateReady'), {
    label: t('toast.reload'),
    run: () => reloadWithUpdate(registration, flushAutosave),
  });
}

function watchRegistration(registration: ServiceWorkerRegistration, flushAutosave: FlushAutosave): void {
  if (watchedRegistrations.has(registration)) return;
  watchedRegistrations.add(registration);

  if (registration.waiting && navigator.serviceWorker.controller) {
    showUpdateReady(registration, flushAutosave);
    return;
  }

  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    if (!worker) return;

    worker.addEventListener('statechange', () => {
      if (worker.state !== 'installed') return;
      if (!navigator.serviceWorker.controller) showOfflineReady();
      else showUpdateReady(registration, flushAutosave);
    });
  });
}

/** Registers the editor's worker and keeps updates out of the user's current stroke. */
export function PwaLifecycle({ flushAutosave = async () => true }: { flushAutosave?: FlushAutosave } = {}) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .then((registration) => watchRegistration(registration, flushAutosave))
      .catch(() => {
        /* The editor still works online when a browser refuses service workers. */
      });
  }, [flushAutosave]);

  return null;
}
