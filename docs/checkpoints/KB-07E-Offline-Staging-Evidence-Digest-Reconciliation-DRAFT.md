# KB-07E — Local staging evidence digest reconciliation (DRAFT / nonauthorizing)

**Date:** 2026-11-07. **Stacked base:** KB-07D draft PR #605. This is an *offline reviewer utility*, not another source-crawl, Auth, SQL, legal policy or deployment implementation.

## Why this addresses a real operational gap

KB-04E's existing `staging-acceptance-ledger.ts` presents all **16** critical independent acceptance scenarios, but it accepts self-reported, detached SHA-256 strings without checking the referenced bytes. A user can attach even 16 validly formatted digests and the ledger is correct to report **0 independently verified**. Before actual staging, independent reviewers need a safe **manual byte-integrity preflight** that checks those SHA-256 claims against an explicitly selected, locally held evidence folder without sending private evidence anywhere.

The new `lib/knowledge-extraction/offline-staging-evidence-verifier.mjs` imports the **existing KB-04E 16-scenario catalog** instead of creating another mutable copy. It reads a single `manifest.json` and at most 16 explicitly named local evidence files and verifies their content hashes. It deliberately **cannot establish that an evidence file depicts a real test, a genuine staging project, a real owner/admin JWT, signed reviewer identity, allowed consent purpose, or approved retention**.

## Minimal manual operator contract

The reviewer must first obtain a separate **approved staging environment** and **independently collected fixture-only evidence** under a local folder not inside the repository. NEVER use customer records, provider keys, bearer tokens or source quotations not approved for external review. Do **not** upload raw evidence or a manifest with IDs to a public GitHub PR/issue, browser widget or CI artifact.

The reviewer may create, locally, a `manifest.json` with the exact strict shape below. All identifiers and digest values shown are **PLACEHOLDERS only**; neither counts as an executed test or an approved project.

```json
{
  "schemaVersion": "kb07e-offline-evidence-v1",
  "stagingProjectRef": "abcdefghijklmnopqrst",
  "tenantA": "10000000-0000-4000-8000-000000000001",
  "tenantB": "10000000-0000-4000-8000-000000000002",
  "runId": "staging-review-placeholder",
  "evidenceFiles": [
    {
      "scenarioId": "ownership_expiry_denies",
      "observedOutcome": "deny",
      "evidenceFile": "ownership_expiry_denies.evidence.json",
      "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  ]
}
```

The reviewer supplies a distinct local evidence file named exactly `ownership_expiry_denies.evidence.json`; the SHA-256 digest must be calculated over **its exact raw bytes**. Actual review files may contain sensitive artifacts, so run locally on an appropriately secured machine and never share their contents in GitHub.

Run with **explicit read-only acknowledgement** and **absolute** local review directory:

```bash
SALSYS_KB_EVIDENCE_REVIEW_ONLY=I_ACKNOWLEDGE_DIGESTS_ARE_NOT_ACCEPTANCE \
  node --experimental-strip-types scripts/kb07e-review-offline-evidence.mjs \
  /absolute/path/to/approved-disposable-staging-review
```

CLI stdout contains only the 16 scenario IDs, non-authorizing digest statuses and totals, **not** file names, project refs, tenant IDs, evidence bodies or tokens. It never connects to Supabase, a website, GitHub or an AI provider. The tool blocks relative directory paths, forbidden Production/Recovery project refs, malformed records, unknown/repeated IDs, traversals, symlinks, missing/oversized files and unexpected manifest fields. **KB-07E file-open hardening:** the operator's local machine must support kernel `O_NOFOLLOW` and `O_NONBLOCK`; an unsupported platform fails closed. The verifier binds the opened descriptor's device/inode and size back to the preceding `lstat` result, to reject both symlink and same-size regular-file swaps between validation and opening. This is local I/O defense-in-depth only, **not** evidence provenance, malicious in-place mutation protection, or an acceptance signature. File limits: 96 KiB manifest, 1 MiB per evidence file, at most 16 files.

An empty/partial bundle, a digest mismatch, or a claim contradicting KB-04E's expected outcome produces a **nonzero CLI exit code**. Exit code 0 requires all 16 expected evidence files with matching digests and expected outcomes. Even then, code 0 means only **local byte-integrity preflight**, **not** independent acceptance or a release PASS. A truthful report ALWAYS says `independentlyVerified:0`, `liveStagingAccepted:false`, `canMerge:false`, and `canDeploy:false`.

**Critical limitation:** a malicious local actor can forge both an evidence file *and* its digest. Hash matching does **not** prove source authenticity, timing, authorship, witness independence, consent validity or legal sufficiency. Independent witness verification must happen outside this utility, with separately protected reviewer evidence and explicit owner sign-off.

## Automated development tests

`tests/knowledge-extraction/offline-staging-evidence-verifier.test.mjs` uses transient **local-only** synthetic files, no database and no network. It checks empty and all-16 manifests remain blocked; valid SHA256 byte comparisons; mismatches and contradictions; duplicate/unknown scenarios, forged project refs, wrong tenant scope; path traversal, symbolic links, missing/oversize files, adversarial symlink and same-size inode swaps between `lstat` and `openSync`, and manual CLI acknowledgement; stdout secret minimization and deterministic no-data-mutation behavior. Tests run through the existing `node --experimental-strip-types --test tests/knowledge-extraction/*.test.mjs` CI workflow.

## Remaining release gates

Dedicated isolated Supabase staging is **not provisioned**; Production `doaozrkrtgeslddwhclj` and Recovery Rehearsal `wunnbqjvfzmawubglyhe` remain forbidden. GitHub protected staging environment and registration stub PR #602 remain unapproved/unmerged; independent privacy/data retention and provider processing policy is missing. **0/16 KB-04E tests independently verified.** No project billing, SQL migration, real Auth login, binding write, consent grant, knowledge retrieval, source crawl, AI call, PR merge or deployment occurs in this work.

**DRAFT / DO NOT MERGE** pending review of the safe local evidence process.
