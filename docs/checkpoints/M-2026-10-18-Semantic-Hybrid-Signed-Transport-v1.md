# SalsysOS — Semantic / Hybrid Signed Transport v1

**Date:** 2026-10-18  
**Branch:** `feature/system-intelligence-v3`

## Goal

Move the existing SEO semantic/hybrid retrieval path onto the same verified AWS SigV4 OpenSearch transport used by lexical search, without enabling production semantic indexing or fabricating an embedding provider.

## Implemented

### Signed OpenSearch transport

`lib/search/seo-semantic.ts` now uses the shared `openSearchFetch(...)` transport for every OpenSearch operation:

- semantic index existence check
- semantic index mapping read
- semantic index creation
- semantic bulk indexing/deletion
- kNN semantic search
- lexical-document hydration through `_mget`

The external embedding-provider call remains separate and unchanged.

### Existing safety controls preserved

- exact `organization_id` filter remains inside kNN queries
- allowed SEO entity types remain mode-bounded
- OpenSearch results are post-validated against the requested organization
- lexical retrieval remains the fallback if semantic retrieval is unavailable
- semantic outbox claiming/completion remains lease-controlled
- embedding model and dimension mismatches fail closed
- semantic enablement remains tenant-controlled in PostgreSQL

## Runtime verification

A temporary preview-only verifier and a temporary exact-path middleware exception were used to test the newly retargeted signed transport from the current branch.

Observed response:

```json
{
  "ok": true,
  "signedOpenSearch": {
    "ok": true,
    "reachable": true,
    "authenticated": true,
    "indexExists": true,
    "mappingSafe": true,
    "indexName": "salsys-global-v1",
    "latencyMs": 1722,
    "reason": null
  },
  "embeddingProviderConfigured": false,
  "semanticMutationPerformed": false
}
```

This verifies that the current branch can reach and authenticate to the real AWS OpenSearch Serverless collection through signed transport.

### Verification deployment

- deployment: `dpl_7NikWHCf22JQEBpvYAmeyrApP69u`
- commit: `4c996a623e1e7f9ebf0f9d972dc776194caac8ce`
- state: `READY`
- verifier returned HTTP 200

### Cleanup

The temporary verifier route was deleted and its temporary middleware bypass was removed immediately after verification.

Cleanup deployment:

- deployment: `dpl_aBfHjchW6GqLc1q5mwnKqujLYrjo`
- cleanup commit: `f29508cd4e5a692428031257e9fca1378d2291f1`
- state: `READY`
- temporary public verifier no longer exists in source
- middleware returned to its prior protected-path behavior

## Current semantic state

Production database settings remain OFF for every checked tenant:

- `enabled=false`
- `model_name=null`
- `dimensions=null`
- `batch_size=20`
- `pilot_max_documents=25`
- `lexical_weight=0.55`
- `semantic_weight=0.45`

No semantic documents were created or mutated during this checkpoint.

## Remaining blocker for real kNN / hybrid E2E

No embedding provider is currently configured in Vercel. The existing semantic contract expects:

- `SEO_EMBEDDING_URL`
- `SEO_EMBEDDING_MODEL`
- `SEO_EMBEDDING_DIMENSIONS`
- optional `SEO_EMBEDDING_API_KEY`

Therefore real vector creation, semantic indexing, kNN querying and hybrid-result calibration are intentionally not claimed as E2E verified yet.

Claude is not used as an embedding provider and must not be treated as one.

## Status

- semantic OpenSearch signed transport migration: **VERIFIED**
- semantic tenant filtering / post-validation code: **PRESERVED**
- semantic settings: **OFF**
- real embedding generation: **BLOCKED ON PROVIDER CONFIGURATION**
- real vector indexing: **NOT RUN**
- real kNN retrieval: **NOT RUN**
- hybrid ranking calibration: **NOT RUN**
- production rollout: **OFF**

## Next checkpoint

Until an embedding provider is selected and securely configured, continue with the next independent production-readiness milestone rather than inventing vector evidence.

Recommended next independent milestone: **Smart Triggers controlled production pilot** — inspect the current scheduler/runtime state, verify secrets and safety flags, run a no-send pilot, and keep autonomous messaging disabled until an explicitly approved send action is tested.
