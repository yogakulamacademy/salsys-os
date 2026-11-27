import 'server-only';
export const KNOWLEDGE_BROKER_RUNTIME_WIRED=false as const;
type Query=(statement:string,params:unknown[])=>Promise<{rows:Record<string,unknown>[]}>;
const operations=new Map<string,{sql:string;arity:number}>([
 ["select knowledge_import_review.current_scope() as organization_id",{sql:"select knowledge_import_review.broker_current_scope() as organization_id",arity:0}],
 ["select knowledge_import_review.reserve_current($1,$2,$3,$4) as id",{sql:"select knowledge_import_review.broker_reserve_current($1,$2,$3,$4) as id",arity:4}],
 ["select knowledge_import_review.cancel_current($1) as ok",{sql:"select knowledge_import_review.broker_cancel_current($1) as ok",arity:1}],
 ["select * from knowledge_import_review.gateway_acquire($1,$2,$3)",{sql:"select * from knowledge_import_review.broker_gateway_acquire($1,$2,$3)",arity:3}],
 ["select knowledge_import_review.gateway_append($1,$2,$3,$4,$5,$6) as n",{sql:"select knowledge_import_review.broker_gateway_append($1,$2,$3,$4,$5,$6) as n",arity:6}],
 ["select knowledge_import_review.gateway_begin_publication($1,$2,$3,$4) as bytes",{sql:"select knowledge_import_review.broker_gateway_begin_publication($1,$2,$3,$4) as bytes",arity:4}],
 ["select knowledge_import_review.gateway_lock($1,$2,$3,$4,'publishing')",{sql:"select knowledge_import_review.broker_gateway_lock($1,$2,$3,$4)",arity:4}],
 ["select knowledge_import_review.gateway_register($1,$2,$3,$4,$5,$6,$7,$8::jsonb) as status",{sql:"select knowledge_import_review.broker_gateway_register($1,$2,$3,$4,$5,$6,$7,$8::jsonb) as status",arity:8}],
 ["select * from knowledge_import_review.gateway_publication_receipt($1,$2,$3,$4)",{sql:"select * from knowledge_import_review.broker_gateway_publication_receipt($1,$2,$3,$4)",arity:4}],
 ["select * from knowledge_import_review.current_history($1,$2,$3)",{sql:"select * from knowledge_import_review.broker_current_history($1,$2,$3)",arity:3}],
 ["select j.organization_id,j.id,j.requested_by,j.request_session_id,j.object_path,j.declared_bytes,j.upload_expires_at,j.status from knowledge_import_review.lock_job($1,$2) j",{sql:"select * from knowledge_import_review.broker_reservation($1,$2)",arity:2}],
 ["select * from knowledge_import_review.digest_payloads($1::jsonb)",{sql:"select * from knowledge_import_review.broker_digests($1::jsonb)",arity:1}],
]);
/** Only these exact statements may reach the dedicated application principal.
 * Transport must bind verified claims transaction-locally, use hard timeouts and discard failed
 * connections. No raw SQL from HTTP, no service-role fallback or generic query passthrough. */
export function createKnowledgeBrokerQueryReview(transport:Query):Query{
 return async(statement,params)=>{
  const op=operations.get(statement);
  if(!op||!Array.isArray(params)||params.length!==op.arity)throw Error('application broker operation denied');
  return transport(op.sql,params);
 };
}
