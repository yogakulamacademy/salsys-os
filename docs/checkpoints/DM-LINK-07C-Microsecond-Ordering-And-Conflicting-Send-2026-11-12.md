# DM-LINK-07C — Microsecond-accurate timeline and contradictory send proof handling

**Checkpoint:** 2026-11-12.  
**Branch:** `feature/dm-link-evidence-policy-v1-20261111`.  
**Status:** Offline pure-code correction and regression coverage; **NOT merged, deployed or authorized for live traffic**.  
**Roadmap:** #696. R2 release gates #518 and #531 remain NO-GO.

## Findings

### 1. Sub-millisecond timestamp ordering flaw

DM-LINK-07B accepted `timestamptz` strings containing up to six fractional seconds but used JavaScript `Date.parse`, which returns integer **milliseconds**, discarding the lower three fractional digits. Example: `...00.000001Z` and `...00.000002Z` produce identical `Date.parse` values. This could make a recorded visit a microsecond **before** actual link activation appear at the same instant and satisfy the attribution gate.

**Correction:** `lib/ai/dm-link-registry-lifecycle.ts` now has an offset-aware ISO-8601 `parseTime` returning **Unix microseconds as `bigint`**. It preserves the six-digit fraction by parsing the millisecond part with `Date.parse` and appending the final three microsecond digits, and uses BigInt for all lifecycle chronology comparisons. Its maximum-lived-link check now uses `BigInt(hours) * 3_600_000_000n`, avoiding mixed types or rounding. Main source continues to target Node/TypeScript BigInt support as declared by the repository.

This ensures exact ordering for: issuance, Meta provider acceptance, verified DB activation, website observation, expiry, provider rejection, permitted TTL, and evaluation timestamp. The source still depends on trusted, immutable database timestamps in the eventual server adapter; this function alone is not an authorization system or clock synchronization guarantee.

### 2. Accepted-send vs. rejection evidence conflict

Even after DM-LINK-07A prevented `definitive_failure` retirement without verified negative proof, the `provider_accepted` branch could propose activation while `failureProof` was also present.

**Correction:** If a rejection proof is present alongside an accepted send, `planDmLinkReservationTransition` returns **`manual_review: conflicting_send_outcomes`**, never `activate`. This is intentionally fail-closed even when the rejection is not yet independently validated; the privileged adapter must investigate and classify conflicting source records. No automatic resend or closeout is authorized.

## Test evidence — exact scope

- Updated the existing `tests/readiness/dm-link-registry-lifecycle-v1.test.cjs` from 47 to **60 synthetic scenarios** (13 new).
- Coverage includes: accepted + rejected outcome conflict; microsecond ordering for accepted and rejected send proof relative to reservation issue; TTL overrun by 1 microsecond; exact TTL; visit before activation by 1 microsecond; visit at activation microsecond; activation before/at provider acceptance; visit just before/at expiry; accepted timestamp before issue; timezone-offset equivalence.
- **60/60 test callbacks passed, 0 failed** in an isolated in-memory V8 execution of the source and committed test file, with TypeScript annotations removed by a narrow synthetic loader. The source/test blobs were fetched back from the feature branch to run these callbacks. This is NOT a native `node --test`, TypeScript `tsc --noEmit`, full readiness suite, GitHub Actions or CodeQL run.
- The execution container's `git ls-remote` against the repository still fails on DNS for `github.com`, so there was no full checkout or CI from this session. GitHub connector writes and read-back were successful.
- The project-wide TypeScript compiler must independently check use of `bigint`, actual target configuration, and any integration with timestamp-return types before code review sign-off. No branch-level CI success is claimed.

## Unchanged release and privacy boundaries

- The only GitHub changes for this checkpoint were to `lib/ai/dm-link-registry-lifecycle.ts`, its offline readiness test and this engineering note. No runtime API route or SQL.
- Link attribution is still **token-link only**, not person identity, verified location of residence, nationality or eligibility for India vs international prices.
- The existing offline CRM pipeline and coverage classifier are **not yet connected** to this activation guard, because a verified server registry, lawful event path, and database transaction do not exist. Any future visitor-event writer must validate accepted-at + activation-at ordering and consent/purpose at the time of association, before storing or surfacing a lead-linked country.
- No HMAC token issuance, redirect, IP country lookup, task insert, Instagram message, outbound automation, training, feature flag, paid resource, staging deployment, merge or production mutation.
- R2 recovery/DBA/privacy independent approvals and 0/16 signed-in staging acceptance remain on hold (#518, #531); the optional behavioral collector remains OFF. A GitHub review marked approved on another draft change is not substantive recovery/production authorization.

## Next justified work

The next useful engineering step is a **complete native test/TypeScript/CodeQL verification** of the consolidated DM-LINK branch in a controlled, no-deploy environment; independent reviewer must examine the exact provenance, BigInt timestamps, link preview/bot/forward semantics and URL-to-lead privacy. After an approved data-use contract and review, the real server-only registry/migration and transactionally safe event/task integration can be separately implemented. Do not create speculative live routes while current R2 approval gates remain blocked.
