import { useEffect } from 'react';
import { t } from '../i18n';
import { toast } from './uiStore';

const OFFLINE_READY_KEY = 'baipix.offlineReady';
const watchedRegistrations = new WeakSet<ServiceWorkerRegistration>();

function showOfflineReady(): void {
  try {
    if (localStorage.getItem(OFFLINE_READY_KEY)) return;
    localStorage.setItem(OFFLINE_READY_KEY, '1');
  } catch {
    return;
  }

  toast(t('toast.offlineReady'));
}

function reloadWithUpdate(registration: ServiceWorkerRegistration): void {
  const waiting = registration.waiting;
  if (!waiting) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
    once: true,
  });
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

function showUpdateReady(registration: ServiceWorkerRegistration): void {
  toast(t('toast.updateReady'), { label: t('toast.reload'), run: () => reloadWithUpdate(registration) });
}

function watchRegistration(registration: ServiceWorkerRegistration): void {
  if (watchedRegistrations.has(registration)) return;
  watchedRegistrations.add(registration);

  if (registration.waiting && navigator.serviceWorker.controller) {
    showUpdateReady(registration);
    return;
  }

  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    if (!worker) return;

    worker.addEventListener('statechange', () => {
      if (worker.state !== 'installed') return;
      if (!navigator.serviceWorker.controller) showOfflineReady();
      else showUpdateReady(registration);
    });
  });
}

/** Registers the editor's worker and keeps updates out of the user's current stroke. */
export function PwaLifecycle() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .then(watchRegistration)
      .catch(() => {
        /* The editor still works online when a browser refuses service workers. */
      });
  }, []);

  return null;
}
