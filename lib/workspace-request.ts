/** Share overlapping shell reads only; settled data is never cached. */
export function createWorkspaceRequest(fetcher: typeof fetch = fetch) {
  let pending: Promise<Response> | null = null;
  return function requestWorkspace(): Promise<Response> {
    if (!pending) {
      pending = Promise.resolve().then(() => fetcher('/api/workspace', {
        cache: 'no-store', credentials: 'same-origin',
      })).finally(() => { pending = null; });
    }
    // Each consumer owns its response body and its existing error handling.
    return pending.then(response => response.clone());
  };
}
