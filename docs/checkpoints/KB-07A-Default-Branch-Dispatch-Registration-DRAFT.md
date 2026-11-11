# KB-07A — Default-branch manual staging workflow registration (DRAFT / DO NOT MERGE)

**Date:** 2026-11-07. **Base:** exact current `main` SHA `78464869c3be3306c654b07460dbae41f87e359b`. This is a **separate, narrow proposal** from the unmerged Knowledge Builder stack and does not change PR #599/#600.

## Why this is required

GitHub documents that a manually triggered `workflow_dispatch` workflow needs a file on the **default branch** before the workflow can be dispatched. See [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch) and [Manually running a workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow). The full KB-06H manual workflow exists only on draft feature branch `feature/kb06h-isolated-staging-session-bind-handshake` (PR #599). It is not in `main`, so an operator cannot currently treat it as an enabled manual action.

This PR proposes **ONLY** a default-branch registration file at `.github/workflows/kb-isolated-staging-session-binding.yml` with the same workflow display name and dispatch input names. The file has **one unconditional failing job**, with no checkout, no environment, no `uses` actions, no network, no auth key, no jobs for staging, no provider activity, and no write permission. Its only step prints a blocked message and exits 1, including when manually run on `main`.

The source-only test `tests/readiness/kb-staging-registration-stub.test.cjs` is included in the existing `npm run test:readiness` CI command and fails on privilege, token, environment, external action, extra job step or runnable body changes.

## Proposed later operator sequence — NOT AUTHORIZED OR EXECUTED

1. Obtain independent owner + security review of this narrowly scoped workflow file and of **the entire selected KB-06H feature commit**. Separate explicit approval would be required to merge just this registration stub into `main`; this draft PR is not authorization. Merging a stub does not deploy KB code.
2. First independently approve and provision a new isolated, disposable Supabase staging project, paid/billed only with owner approval, separate from Production (`doaozrkrtgeslddwhclj`) and Recovery Rehearsal (`wunnbqjvfzmawubglyhe`). Populate only approved synthetic fixtures and reviewed KB draft migrations **on that staging project**.
3. Configure and independently inspect GitHub environment `kb-isolated-staging-session-binding-acceptance` with named required reviewers, prevent-self-review where possible, selected reviewed branches, and exact SHA/project claims. Do **not** assume the environment is protected merely because YAML names it.
4. After the minimal default-branch registration stub is independently approved and merged, manually dispatch against an independently **reviewed feature branch/ref containing the complete KB-06H workflow**, not `main`. GitHub uses the selected ref in `GITHUB_REF`/`GITHUB_SHA`; verify the effective workflow file and exact checkout SHA before running. A run against `main` must always fail by construction. The operator must separately supply the stronger two-binding approval phrase and independent environment variables.
5. Treat even a successful staging runner as **test observations only**; reconcile real Auth session creation, local logout, data retention and evidence with independent reviewers. It cannot self-close KB-04E's **16 independent scenarios**.

**Important security boundary:** Selecting an unreviewed feature branch can expose a protected environment's secrets to untrusted workflow code after an environment approval. Do not dispatch from unknown refs. Separately review the selected ref, workflow, commit, operators and environment access controls and record the approval before any staging credentials become available.

## Current blockers

- **No approved isolated staging project**. The connected inventory lists only Production and Recovery Rehearsal.
- **No independently verified GitHub environment protection configuration**; the connected GitHub API environment endpoint is not accessible from this workflow.
- **No authorized legal consent notice, approved quote/derived-data retention/deletion policy or live independent QA**.
- 0/16 KB-04E external independent staging scenarios verified. KB-06H PR #599 and integration PR #600 remain draft/unmerged.

## Non-actions

This change is an **unmerged PR**, does not register a workflow on the deployed default branch, and does not run the stub or any staging workflow. No Supabase project creation, hosted SQL, Auth sessions, binding writes, consent grants, AI/provider calls, crawls, main writes, deployments, or retention operations.

**DRAFT / DO NOT MERGE** without independent review and owner authorization.
