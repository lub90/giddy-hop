import { registerSW } from 'virtual:pwa-register';
import { t } from '../i18n';

/** How often an open game asks the server for a new version (a party can last hours). */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * Registers the service worker that keeps the game playable offline and shows
 * small hints at the bottom: once when everything is cached ("now playable
 * offline"), and when a new version is available ("new version – reload").
 * Nobody ever has to clear a cache by hand.
 */
export function registerOfflineApp(): void {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      showNotice(t('update.available'), {
        label: t('update.reload'),
        action: () => {
          // Reload as soon as the new version has taken over – also on the very
          // first visit, where the plugin itself does not reload.
          navigator.serviceWorker?.addEventListener('controllerchange', () => location.reload(), { once: true });
          void updateSW(true);
        },
      });
    },
    onOfflineReady() {
      showNotice(t('update.offlineReady'), undefined, 5000);
    },
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => void registration.update(), UPDATE_CHECK_MS);
    },
  });
}

function showNotice(text: string, button?: { label: string; action: () => void }, hideAfterMs?: number): void {
  document.querySelector('.update-notice')?.remove();
  const el = document.createElement('div');
  el.className = 'update-notice';
  el.setAttribute('role', 'status');
  el.textContent = text;
  if (button) {
    const b = document.createElement('button');
    b.type = 'button';
    b.tabIndex = -1;
    b.textContent = button.label;
    b.addEventListener('click', button.action);
    el.append(' ', b);
  }
  document.body.appendChild(el);
  if (hideAfterMs) setTimeout(() => el.remove(), hideAfterMs);
}
