# Manual pilot launch configuration — approval worksheet

Status: PROPOSAL ONLY. This document does not create plans, seed a trial policy, grant operator privileges, publish prices, or authorize production deployment.

## Decisions already made
- Permanent Free plan; 14-day Pro trial from verified workspace creation, followed by Free without automatic charges or deletion.
- First ten distinct organizations in the manual approval pilot. Free registrations are not capped by pilot capacity.
- Customer selection is a request. Super Admin can assign a different published plan, grant complimentary access, confirm offline payment, and manually renew access.
- Gateway integration and recurring billing deferred until separately authorized.

## Initial commercial proposal (not approved)

| Plan | INR/month/workspace | Active named users | Retained lead records |
| --- | ---: | ---: | ---: |
| Free | 0 | 1 | 250 |
| Basic | 1499 | 2 | 2000 |
| Growth | 3499 | 5 | 10000 |
| Pro | 6999 | 10 | 50000 |

The prices and quotas are prior working proposals, not a final decision. Confirm tax treatment and whether to offer any optional setup service before recording exact snapshots. No mandatory setup charge for Free. Do not offer any unverified capability, AI, automated messaging or provider activation. Workspace and integration codes must be individually approved and mapped to actual enforced boundaries; no inference from tier names. Free must include admin and be a subset of each paid tier's workspace scope; Free integration codes must be a subset of Pro's. Verify all Free/Pro pinned limits and scopes match the published offer exactly.

## Deployment gates
1. Exact integrated PR #829 head: all CI, migration replay including full local P0 checks, CodeQL and image checks green. No independent overlapping merge of #826/#827/#828.
2. Isolated real Supabase Auth rehearsal: migrate reviewed candidates in dependency order P0, P1 governed plans, P2 verified signup, P1 change requests, manual approvals, manual activation. Quote/payment candidates may remain unapplied (gateway deferred). Do not apply draft SQL as-is to production. Generate reviewed migration files and verify actual migration ledger/order.
3. Security review: RLS/ACLs, private schemas, trusted session-derived operator identity and exact platform organization UUID; verify no cross-tenant access. Dedicated publication roles and separate approval evidence. No production role grants before explicit approval.
4. After exact commercial approval, create/review/publish four plan versions using governance; configure trial policy from published Free and Pro with matching versions, scopes and limits. Use read-only commercial configuration readiness panel; its green status is not deployment approval.
5. Test real email verification and resume, manual pilot enrollment, customer request and admin override, renewal, downgrade, at-limit writes, expiry before/after reconciliation, and legacy customers unchanged. Verify self-host expiry scheduling and monitoring. No customer data used in isolated fixtures.
6. Release sequence: default-off feature flags, check backup and rollback; enable protected admin only after schema and roles verified, then manual activation/reconciliation and commercial enforcement with exact tests, finally public signup. Do not disable commercial enforcement or expiry for existing managed tenants when pausing new signup. For a pause, disable new signup and new plan changes/activation while preserving access enforcement and reconciliation. Payment/quote switches remain off.
7. Explicit release approval before any production migration, config, grants, prices, or activation. Pilot activation capped at ten distinct organizations; no automatic switch to gateway.

## Known constraints
The current candidate implements user/lead quotas and workspace/integration access. Advanced capability enablement and automated sends are separately restricted; do not promise them based on plan names. Manual paid access is bounded to one month per approval in the candidate; confirm this operational policy. Published version edits, provider payment, invoices and recurring billing remain out of scope. Real Auth rehearsal and production rollback are not yet evidenced. The current development readiness panel checks database configuration only, not live deployment or payment verification.
