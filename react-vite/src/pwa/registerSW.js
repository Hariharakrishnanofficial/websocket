/**
 * Registers the vite-plugin-pwa service worker. Surfaces update / offline
 * events to the console for now — a toast UI can subscribe later.
 */
import { registerSW } from 'virtual:pwa-register';

export function initServiceWorker() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  try {
    registerSW({
      immediate: true,
      onNeedRefresh() {
        console.info('[pwa] new content available; refresh to update');
      },
      onOfflineReady() {
        console.info('[pwa] app ready to work offline');
      },
      onRegisterError(err) {
        console.warn('[pwa] SW registration failed:', err);
      },
    });
  } catch (err) {
    console.warn('[pwa] register threw:', err);
  }
}
