# AI-09E — Server-owned Auth Boundary (DRAFT / NON-EXECUTABLE)

**Date:** 2026-11-09  
**Branch / review:** [PR #671](https://github.com/yogakulamacademy/salsys-os/pull/671) on `integration/kb16-r2-main-preserve-20261109`.  
**State:** SOURCE-ONLY. No application imports, no live AI tool call, no new public API, no hosted Supabase migration, no MCP endpoint, no model/provider calls, no production changes.

## Why a separate AI-specific Auth boundary is required

The existing SalsysOS CRM has normal workspace-oriented helpers and session-bound authorization. Those helpers have historical compatibility behaviors that must **not** automatically authorize new AI read tools:

- `supabase/migrations/20261014061001_session_bound_tenant_authorization.sql` includes a sole-active-membership fallback in `current_tenant_organization_id()`. It also includes service-role bypasses in generic authorization helpers. The effective deployed state of those helpers must be independently verified before any release.
- `supabase/migrations/20261027200500_extend_current_workspace_context_with_access.sql` includes a path that may bind a session automatically when a binding does not exist. That behavior may be appropriate in normal login/workspace UX but is unacceptable for fail-closed AI tool authorization.
- `lib/ai/lead-context.ts` already performs `auth.getUser()` plus tenant and lead checks before privileged reads, but uses a separate `createAdminClient()` read path. This is **not** a substitute for a single, independently authorized, tenant-scoped, audited SQL tool transaction.

## New artifacts

- `lib/ai/read-only-auth-boundary-v1.ts`: server-only, not imported by any route/Co-Pilot or Knowledge action. It validates the same strictly allowlisted tool proposal grammar as AI-09B, calls the current **cookie-scoped** Supabase `auth.getUser()` (not `getSession()`), then proposes to call a *dedicated, currently non-existent* `ai_read_current_bound_session_v1` RPC as the authenticated user.
- `tests/readiness/read-only-auth-boundary-v1.test.cjs`: isolated synthetic unit tests with injected fake Supabase client/RPC; no network or hosted Supabase.
- The client sends **only** `p_organization_id` to the proposed RPC, as a scope hint. No actor, role, session ID, SQL, tool arguments or caller-chosen endpoint are ever sent. A returned direct binding must match the independent `auth.getUser()` identity, requested tenant, current live session, active membership and owner/admin role. A fallback binding, extra fields, or privileged role claim fails closed.
- The result includes only `session_binding_review_only`, tool and tenant IDs, and `nextRequiredControl='atomic_resource_read_and_committed_audit'`. It NEVER includes user ID, session ID, JWT, access token, CRM data or permission to execute. `mayExecute=false` and the compile-time `READ_ONLY_AUTH_BOUNDARY_RUNTIME_WIRED=false` remain invariant.

## Critical limitations

1. **The dedicated RPC does NOT exist in production, staging or a migration.** Any actual invocation currently returns `binding_unavailable`; there is no switch, fallback helper or privileged bypass. This is by design. The implementation is a *review preflight contract*, not a working authorized read adapter.
2. **The caller must not control dependencies.** Tests use synthetic Supabase stubs; those cannot authenticate real people, verify JWT signatures, prove database session binding or enforce RLS. The real runtime uses the server-only Supabase client. Independently validate the eventual dedicated RPC's trusted claims, function owner, grant list, schema exposure, `auth.sessions` policy, tenant-session binding, member-role status and revocation locks.
3. **A structurally valid RPC response is not an authorization token.** Even with true signed Auth and valid session binding, real Knowledge consent/source validation, per-lead RBAC and the protected output projection must run within the actual read transaction. A durable audit append must commit before any output can be returned. A separate security review must determine the disposition of denied-attempt audit events, which roll back with failed SQL transactions in AI-09D's local prototype.
4. **Use no service-role shortcut.** In particular, do not replace the dedicated RPC with `current_tenant_organization_id()`, `session_is_bound_to_organization()`, an auto-binding workspace RPC, caller-supplied tenant/role, or a privileged `createAdminClient()` query preceded merely by a separate role check.
5. **Independent release gates remain unchanged.** Security/DBA (#612), legal/privacy/retention (#613), protected cutover and 16 real signed-user staging witnesses (#601), plus separately approved isolated staging scope/cost (#614) are still open. Owner's staging hold remains; 0/16 witnessed. The production-deploy-linked `main` branch must not be merged or promoted from this draft.

## Proposed future acceptance contract (not installed)

An independently DBA-reviewed `ai_read_current_bound_session_v1(p_organization_id uuid)` would need to:

- Reject non-authenticated callers and service-role users; derive user and session from **validated request Auth** rather than function arguments.
- Reconfirm `auth.sessions`, the exact `tenant_session_bindings` row, active organization and independent current tenant membership/role without auto-binding or sole-membership fallback.
- Use an approved `SECURITY DEFINER` owner/grants or invoker-RLS design with no caller-controlled `search_path`, controlled exposure and safe revocation.
- Return only fixed schema and authenticated identity fields for the subsequent private server preflight, not a reusable long-lived capability.
- Recheck all of these inside the later *same-transaction* read-and-audit operation; any preflight result on its own must never grant tool execution.

**Next decision:** independent DBA/security/legal review of the above RPC contract and AI-09D read/audit design. No deployment, production migration, or staging bypass is implied by engineering tests.
