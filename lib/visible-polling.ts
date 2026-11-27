/** Poll a read feed while visible/online, with one request at a time. */
export function startVisiblePolling(load: () => Promise<boolean | void>, intervalMs: number) {
  let stopped = false;
  let inFlight = false;
  let lastAttempt = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const ready = () => document.visibilityState === 'visible' && navigator.onLine !== false;
  const clear = () => { if (timer !== null) clearTimeout(timer); timer = null; };

  const schedule = () => {
    clear();
    if (stopped || inFlight || !ready()) return;
    const remaining = intervalMs - (Date.now() - lastAttempt);
    if (remaining > 0) { timer = setTimeout(() => { timer = null; void run(); }, remaining); return; }
    void run();
  };
  const run = async () => {
    if (stopped || inFlight || !ready()) return;
    inFlight = true;
    lastAttempt = Date.now();
    try {
      if (await load() === false) { dispose(); return; }
    } catch {
      // Feed-specific loaders own presentation; retry only at the next interval.
    } finally {
      inFlight = false;
      // Slow requests must not cause an immediate retry loop.
      lastAttempt = Date.now();
      schedule();
    }
  };
  const dispose = () => {
    stopped = true;
    clear();
    document.removeEventListener('visibilitychange', schedule);
    window.removeEventListener('focus', schedule);
    window.removeEventListener('online', schedule);
    window.removeEventListener('offline', schedule);
  };
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('focus', schedule);
  window.addEventListener('online', schedule);
  window.addEventListener('offline', schedule);
  schedule();
  return dispose;
}
