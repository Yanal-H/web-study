const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

export function shouldCheckForAppUpdate(
  lastCheckedAt: number,
  now: number,
  online: boolean,
  visible: boolean
): boolean {
  return online && visible && now - lastCheckedAt >= UPDATE_CHECK_INTERVAL_MS;
}

/**
 * Register and keep the production app shell current.
 *
 * Browsers normally check a worker only during navigation. An installed tablet
 * app can remain open for days, so we also perform a throttled, no-credit update
 * check when it comes online or returns to the foreground. Protected Supabase
 * content is never cached by this worker.
 */
export function registerAppShellWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    const serviceWorker = navigator.serviceWorker;
    const hadControllerAtBoot = Boolean(serviceWorker.controller);
    let reloadingForUpdate = false;
    let lastCheckedAt = 0;

    serviceWorker.addEventListener('controllerchange', () => {
      // clients.claim() also fires this event on the very first installation.
      // Reload only when a previously controlled app receives a new deployment.
      if (!hadControllerAtBoot || reloadingForUpdate) return;
      reloadingForUpdate = true;
      window.location.reload();
    });

    void serviceWorker
      .register('/sw.js')
      .then((registration) => {
        const checkForUpdate = () => {
          const now = Date.now();
          if (
            !shouldCheckForAppUpdate(
              lastCheckedAt,
              now,
              navigator.onLine,
              document.visibilityState === 'visible'
            )
          ) {
            return;
          }
          lastCheckedAt = now;
          void registration.update().catch((error: unknown) => {
            console.warn('Service worker update check failed', error);
          });
        };

        checkForUpdate();
        window.addEventListener('online', checkForUpdate);
        window.addEventListener('focus', checkForUpdate);
        document.addEventListener('visibilitychange', checkForUpdate);
      })
      .catch((error: unknown) => {
        console.warn('Service worker registration failed', error);
      });
  });
}
