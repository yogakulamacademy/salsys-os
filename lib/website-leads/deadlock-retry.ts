/**
 * One bounded retry for PostgreSQL's transactional deadlock abort (40P01).
 * Scope this only to the idempotent website lead-ingest RPC; never retry
 * privacy decisions, outbound sends, enrichment or payment actions.
 */
type RpcOutcome = { error: { code?: string | null } | null };

export async function retryWebsiteLeadIngestDeadlock<T extends RpcOutcome>(
  invoke: () => PromiseLike<T>,
  pause: (ms: number) => Promise<void> =
    (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  const first = await invoke();
  if (first.error?.code !== '40P01') return first;
  // PostgreSQL aborts the failed transaction; reusing the original event ID
  // allows the existing ingest function to enforce idempotency on retry.
  await pause(35);
  return invoke();
}
