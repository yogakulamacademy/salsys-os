/** A late read must never replace a newer record selection, including A → B → A. */
export function createLatestReadGuard() {
  let sequence = 0;
  let active: AbortController | null = null;
  return {
    start() {
      active?.abort();
      const controller = new AbortController();
      active = controller;
      const token = ++sequence;
      return { signal: controller.signal, cancel: () => controller.abort(), isCurrent: () => sequence === token && !controller.signal.aborted };
    },
    invalidate() { sequence++; active?.abort(); active = null; },
  };
}
