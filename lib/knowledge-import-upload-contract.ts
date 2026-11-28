/**
 * Offline upload receipt contract. No storage, network, database or authorization calls.
 * Only a future server-owned boundary may supply verified context and object metadata.
 */
export const KNOWLEDGE_IMPORT_UPLOAD_RUNTIME_WIRED = false as const;
export const KNOWLEDGE_IMPORT_BUCKET = 'knowledge-import-private-v1';
const MAX_BYTES = 50 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
type Context = Readonly<{ organizationId: string; actorId: string; sessionId: string; active: boolean; canManage: boolean }>;
type Reservation = Readonly<{ organizationId: string; actorId: string; sessionId: string; jobId: string; objectPath: string; declaredBytes: number; expiresAtMs: number }>;
type Receipt = Readonly<{ bucket: string; objectPath: string; byteLength: number; sha256: string; contentType: string }>;
type Rejection = { ok: false; reason: 'invalid_reservation' | 'access_denied' | 'expired' | 'object_mismatch' | 'invalid_object'; mayExecute: false };
type Success = { ok: true; preview: { organizationId: string; jobId: string; objectPath: string; byteLength: number; sha256: string }; mayExecute: false };
const deny = (reason: Rejection['reason']): Rejection => ({ok:false,reason,mayExecute:false});
const uuid = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);
const validBytes = (n: number) => Number.isSafeInteger(n) && n > 0 && n <= MAX_BYTES;
export function knowledgeImportObjectPath(organizationId: string, jobId: string): string | null {
  return uuid(organizationId) && uuid(jobId) ? organizationId.toLowerCase() + '/' + jobId.toLowerCase() + '/source.json' : null;
}
/** A successful preview is NOT authority to issue an upload token, queue work or create drafts. */
export function inspectKnowledgeImportReceipt(context: Context, reservation: Reservation, object: Receipt, nowMs: number): Rejection | Success {
  if (!context || !reservation || !object || !Number.isSafeInteger(nowMs)) return deny('invalid_reservation');
  const path = knowledgeImportObjectPath(reservation.organizationId, reservation.jobId);
  if (!path || path !== reservation.objectPath || !uuid(reservation.actorId) || !uuid(reservation.sessionId) || !validBytes(reservation.declaredBytes) || !Number.isSafeInteger(reservation.expiresAtMs)) return deny('invalid_reservation');
  if (context.active !== true || context.canManage !== true || context.organizationId !== reservation.organizationId || context.actorId !== reservation.actorId || context.sessionId !== reservation.sessionId) return deny('access_denied');
  if (nowMs >= reservation.expiresAtMs) return deny('expired');
  if (object.bucket !== KNOWLEDGE_IMPORT_BUCKET || object.objectPath !== path) return deny('object_mismatch');
  if (!validBytes(object.byteLength) || object.byteLength !== reservation.declaredBytes || typeof object.sha256 !== 'string' || !SHA256.test(object.sha256) || object.contentType !== 'application/json') return deny('invalid_object');
  return {ok:true,preview:{organizationId:reservation.organizationId,jobId:reservation.jobId,objectPath:path,byteLength:object.byteLength,sha256:object.sha256},mayExecute:false};
}
