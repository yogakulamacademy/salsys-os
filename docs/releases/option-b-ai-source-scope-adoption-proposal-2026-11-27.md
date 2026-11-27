# Option B — P0 AI source-scope adoption proposal (NOT ADOPTED)

Prepared: 2026-11-27. Pinned main: `c771f03bd225b500706e2cd231b7920808a8ad04`.
Decision requested: separately reviewed, narrow **source-only** expansion of Option A. No approval, merge, deployment, production or staging action is implied by this document.

## Evidence and rationale

- Existing [Option A record](option-a-limited-release-2026-11-10.md) and `tests/readiness/option-a-limited-release-boundary.test.cjs` forbid deferred AI modules. Preserve both in this PR, including all negative assertions.
- [PR #916](https://github.com/yogakulamacademy/salsys-os/pull/916) head `997c64fbe9925f2714e1e66bf37874714baeb5f3`: CI readiness 679/682 passed, three failures; typecheck, financial database and CodeQL passed. The intentional Option A gate and two outdated manual Knowledge hashes explain the three failures. Not mergeable by policy; do not use green partial checks as release clearance.
- [PR #915](https://github.com/yogakulamacademy/salsys-os/pull/915) head `05b62b1f1624911a56c97b43c2205463d38b2dbe` has all scheduled checks passed, but is separate, draft and unmerged.
- Combined [PR #671](https://github.com/yogakulamacademy/salsys-os/pull/671) remains divergent; do not bulk merge. Historical approvals #679, #681 and #678 match their focused snapshots, not this integration decision. [#676](https://github.com/yogakulamacademy/salsys-os/pull/676) is a review index, not proof of six independently accepted slices.

## Proposed permitted source files (not yet authorized to land on main)

Only these four inert modules and four corresponding readiness tests are proposed for a later, independently reviewed transition:
| Source / test | Pinned blob SHA | Provenance |
| --- | --- | --- |
| lib/ai/agent-governance-v1.ts | e9b8ef78de26662d7f3d14b2176ad488c21ca5aa | #681 |
| tests/readiness/agent-governance-contract-v1.test.cjs | 6384497110ed55c0063606b270b3d8dd5a7d3a93 | #681 |
| lib/ai/read-only-tool-gate-v1.ts | fbf3bb9ca81e61ce4fa6233204532619bdca77e7 | #679 |
| tests/readiness/read-only-tool-gate-v1.test.cjs | 7d3b471a27e744fae8c05163ff66318859b57649 | #679 |
| lib/ai/read-only-tool-result-projection-v1.ts | d7f01b9535730f77854293c6d2bf3897288ded59 | #671, specific review required |
| tests/readiness/read-only-tool-result-projection-v1.test.cjs | f9c34a0147cc84ff9200c29fddcb9269a0f81632 | #671, specific review required |
| lib/ai/copilot-safety-guard-candidate-v1.ts | b03570574c2b2e4b051729895c3be3cef91b48ce | #678 |
| tests/readiness/ai11b-copilot-safety-guard-candidate.test.cjs | 6b8883c4e7ebbbbae47c876630d41100a103133e | #678 |

The Co-Pilot candidate dependency `lib/ai/lead-insight-output-guard.ts` matches current main and parent integration at `d068fd2b998d08f33cb9f031b30e7ca3aed18c94`. All runtime-wired constants remain false; no live imports, tools, data reads, network calls, approval persistence or sending authority. Eligibility/projection is not authorization. No new discovery, worker, staging workflow, MCP, migrations, credentials or new processing. Other deferred paths remain excluded.

## Knowledge baseline reconciliation (proposed, not applied)

Compared old `app/settings/knowledge/actions.ts` blob `30a6ac02c91baefaf440fb979bf6cae94dbd031b` (241 split lines including trailing newline) with current `c20af5946f48e20d5cc805cb8db4f0d2e2304cba` (301 split lines). The entire original line sequence is identical; the new suffix introduces `importKnowledgeDraftsAction` (version 1 JSON, max 2 MiB, up to 400 entries, currentContext(), source-backed creation RPC, p_approve:false). Do not revert that addition. Review import authorization, draft-only semantics, malformed inputs and tenant isolation. After explicit adoption and independent review, re-pin both tests to the verified current baseline, retaining exact hash assertions and semantic negative checks. No hash update in this proposal. Freshly verify if main advances.

## Transition acceptance

1. Independent reviewer verifies exact diff, component provenance, qualifications/independence, scope and current main; owner explicitly records adoption of this source-only scope. This is separate from release and execution authorization.
2. Later transition PR narrowly changes Option A test to permit only the four named inert modules, with fail-closed checks for all other deferred paths, false runtime constants, no reachable production imports (including current Copilot core, Autopilot, Answer Engine, knowledge actions, routes/jobs), no new dispatch or SQL. Keep existing protections and make the scope change explicit. Add negative tests for activation/import and path drift. Do not relax gate until approved.
3. Add the four source/test pairs, review any necessary test baseline changes, verify exact diff from current main. Execute all readiness tests, TypeScript/build/browser/financial tests and CodeQL on exact integrated head; do not omit failed assertions or claim partial results as pass. Independent exact-head approval before any merge.
4. Runtime wiring is a separate proposal. Real server-owned session/tenant/resource checks, durable transactional audit, minimal projections, permission recheck at execution and approval expiry/revocation are mandatory. No model/browser supplied authority.
5. Autopilot hardening is a separate reviewed existing-runtime change: tenant scope on service-role reads and updates; verify message/lead/conversation/account tuple; recheck suppression, policy, fresh customer/employee messages, active state and switches immediately before dispatch; test competing jobs, send caps, provider-accepted/logging-failed and unknown delivery outcomes. Existing schema triggers and policy RPC are evidence, not proof of complete runtime safety. No autonomous scope expansion.
6. Preserve roadmap #518 and authoritative R2 issue #531. Qualified DBA/privacy authority and independence remain unverified; separate owner adoption and execution GO, no-egress AND no-unintended-mutation gates, migration provenance and witnessed 0/16 staging acceptance remain independent. No staging lift, hosted SQL, exports, restore, migrations, production changes or releases authorized here.

## Decision record (pending)

Independent code/security reviewer: pending. Scope owner adoption: pending. Runtime/release decisions: not requested. DBA/privacy and staging: unchanged, on hold. This documentation PR is not the transition PR and changes no tests or application code.
