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

CLI stdout contains only the 16 scenario IDs, non-authorizing digest statuses and totals, **not** file names, project refs, tenant IDs, evidence bodies or tokens. It never connects to Supabase, a website, GitHub or an AI provider. The tool blocks relative directory paths, forbidden Production/Recovery project refs, malformed records, unknown/repeated IDs, traversals, symlinks, missing/oversized files and unexpected manifest fields. **KB-07E file-open hardening (CodeQL review):** the local operator machine must support kernel `O_NOFOLLOW` and `O_NONBLOCK`; otherwise the verifier fails closed. To eliminate pre-open pathname-check races, the verifier no longer trusts a separate `lstat/realpath` check of each evidence/manifest filename before opening it. Instead it atomically uses no-follow/nonblocking flags and validates the **opened file descriptor** as a bounded, nonempty regular file. A symlink substituted before open is blocked by the kernel. An attacker swapping in a different same-size regular file causes a **digest mismatch**, not a verified test result, unless the attacker also controls the manifest (which is outside this tool's trust boundary). The review directory must be controlled by an independent operator; this protects neither in-place concurrent content mutation nor file authenticity, witness identity or release authority. **Post-open mutation bound:** each descriptor is read into a buffer capped at its initially validated `fstat` size, in chunks up to 64 KiB, with at most one extra byte inspected for growth. A premature EOF, unexpected extra byte, or changed descriptor size / mtime / ctime fails closed. This prevents unbounded `readFileSync(fd)` reads if evidence grows between validation and reading. It is not an atomic content snapshot against an attacker who can rewrite bytes in place; the independent reviewer must control the directory. File limits: 96 KiB manifest, 1 MiB per evidence file, at most 16 files.

An empty/partial bundle, a digest mismatch, or a claim contradicting KB-04E's expected outcome produces a **nonzero CLI exit code**. Exit code 0 requires all 16 expected evidence files with matching digests and expected outcomes. Even then, code 0 means only **local byte-integrity preflight**, **not** independent acceptance or a release PASS. A truthful report ALWAYS says `independentlyVerified:0`, `liveStagingAccepted:false`, `canMerge:false`, and `canDeploy:false`.

**Critical limitation:** a malicious local actor can forge both an evidence file *and* its digest. Hash matching does **not** prove source authenticity, timing, authorship, witness independence, consent validity or legal sufficiency. Independent witness verification must happen outside this utility, with separately protected reviewer evidence and explicit owner sign-off.

## Automated development tests

`tests/knowledge-extraction/offline-staging-evidence-verifier.test.mjs` uses transient **local-only** synthetic files, no database and no network. It checks empty and all-16 manifests remain blocked; valid SHA256 byte comparisons; mismatches and contradictions; duplicate/unknown scenarios, forged project refs, wrong tenant scope; path traversal, symbolic links, missing/oversize files, adversarial symlink and same-size regular-file swaps immediately before kernel `openSync`, append/truncate after the descriptor size check, and manual CLI acknowledgement; stdout secret minimization and deterministic no-data-mutation behavior. Tests run through the existing `node --experimental-strip-types --test tests/knowledge-extraction/*.test.mjs` CI workflow.

## Remaining release gates

Dedicated isolated Supabase staging is **not provisioned**; Production `doaozrkrtgeslddwhclj` and Recovery Rehearsal `wunnbqjvfzmawubglyhe` remain forbidden. GitHub protected staging environment and registration stub PR #602 remain unapproved/unmerged; independent privacy/data retention and provider processing policy is missing. **0/16 KB-04E tests independently verified.** No project billing, SQL migration, real Auth login, binding write, consent grant, knowledge retrieval, source crawl, AI call, PR merge or deployment occurs in this work.

**DRAFT / DO NOT MERGE** pending review of the safe local evidence process.
