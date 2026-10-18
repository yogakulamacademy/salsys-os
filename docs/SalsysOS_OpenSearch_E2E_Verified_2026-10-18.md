# SalsysOS — OpenSearch Lexical E2E Verification

**Verified:** 2026-10-18
**Branch:** `feature/opensearch-aws-sigv4-v1`
**Provider:** Amazon OpenSearch Serverless
**Collection:** `salsys-search`
**Region:** `ap-southeast-2`
**Pilot tenant:** `yogakulam-academy`
**Adversarial tenant:** `test-yoga-school`

## Result

The real AWS OpenSearch Serverless lexical provider path is now **E2E VERIFIED for the controlled Preview pilot**.

### Core tenant-search proof

A controlled Yogakulam lead pilot indexed 25 documents through the real Vercel → AWS SigV4 → OpenSearch Serverless path.

Verified retrieval result:

- query: `India`
- Yogakulam total matches: `11`
- returned in probe: `10`
- Yogakulam tenant safety validation: `true`
- foreign `test-yoga-school` matches: `0`
- foreign tenant safety validation: `true`
- verification HTTP result: `200`

This proves both the positive retrieval path and the negative cross-tenant retrieval path for the lexical global-search layer.

### SEO lexical proof

SEO mappings were applied successfully to the real OpenSearch index:

- mapped SEO properties: `119`

A second bounded pilot marked exactly 10 existing real Yogakulam `seo_page` outbox rows for the pilot, then processed one bounded worker run.

Worker result:

- claimed: `10`
- succeeded: `10`
- failed: `0`

SEO content-mode retrieval result:

- Yogakulam SEO matches: `7`
- returned: `7`
- Yogakulam tenant safety validation: `true`
- foreign `test-yoga-school` matches: `0`
- foreign tenant safety validation: `true`
- verification HTTP result: `200`

No synthetic SEO data was inserted for this proof. Existing real derived SEO rows were used.

## Safety state after verification

- `indexing_enabled` was returned to `false` after the bounded SEO verification.
- The pilot remained tenant-scoped to Yogakulam.
- Production environment was not promoted or enabled.
- The temporary public Preview verification route was removed after proof.
- The temporary GET verifier added to the protected SEO bootstrap route was removed after proof.
- OpenSearch remains a derived retrieval layer; PostgreSQL remains source of truth.
- Search code still applies an OpenSearch `organization_id` filter and post-validates returned document tenant IDs.

## Competitor lexical verification status

The competitor OpenSearch mappings/query/source allowlists are implemented, but there is currently no real Yogakulam competitor/ranking evidence in PostgreSQL to index:

- `seo_competitors`: `0`
- `seo_rank_targets`: `0`
- `seo_rank_snapshots`: `0`
- `seo_competitor_analysis_runs`: `0`

Therefore competitor lexical retrieval is **architecture-ready but not real-data E2E verified yet**. Do not seed fake competitor/ranking data merely to make this test pass.

## Updated checklist

### Verified

- [x] Amazon OpenSearch Serverless collection active
- [x] AWS SigV4 authentication from Vercel Preview
- [x] Real OpenSearch index available
- [x] Bounded real Yogakulam lead indexing
- [x] Lead lexical retrieval from real OpenSearch
- [x] Adversarial foreign-tenant lead query returns `0`
- [x] SEO mapping update succeeds on real OpenSearch
- [x] Bounded real Yogakulam SEO page indexing
- [x] SEO lexical retrieval from real OpenSearch
- [x] Adversarial foreign-tenant SEO query returns `0`
- [x] Indexing disabled again after controlled verification
- [x] Temporary verification handlers removed after proof

### Next

- [ ] Populate real competitor registry and rank targets from approved/observed evidence
- [ ] Connect a real SEO/AEO/GEO rank provider or other observed evidence source
- [ ] Run one-query normalization/health test before recurring provider polling
- [ ] Index real `seo_competitor`, `seo_rank_target`, and `seo_competitor_analysis` documents
- [ ] Verify competitor lexical retrieval and foreign-tenant zero-result proof
- [ ] Connect a real embedding provider/model/dimension
- [ ] Run semantic bootstrap → embedding worker → kNN → hybrid/RRF calibration
- [ ] Review/rotate temporary pilot credentials as appropriate before any production rollout
- [ ] Continue W8 tenancy/security closeout separately; search-layer tenant proof is not global W8 sign-off

## Production rollout decision

Do **not** automatically promote this branch or enable organization-wide indexing merely because the controlled E2E proof passed. The next rollout decision should explicitly define tenant scope, indexing cadence, provider credential strategy, monitoring, rollback, and cost controls.
