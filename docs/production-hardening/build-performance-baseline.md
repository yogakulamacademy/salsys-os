# Production build performance baseline

## Purpose

This checkpoint records the production build-cache restoration work completed during PH-0 hardening. It contains no credentials or environment-variable values.

## Verified baseline

- Production framework: Next.js 15.5.28.
- The project previously exposed the Vercel-reserved `VERCEL_FORCE_NO_BUILD_CACHE` key in Production, which caused every production deployment to bypass build cache.
- No repository code, issue, or cache-correctness incident was found that required permanent build-cache bypass.
- The variable was archived in Vercel under a non-reserved key, preserving rollback/audit history without exposing its value.
- Runtime response protections such as `Cache-Control: private, no-store` are application behavior and are independent of Vercel build-artifact caching.

## Uncached correctness baseline

A forced rebuild of the current `main` commit was used only as a clean correctness baseline after removing the reserved cache-bypass key. Because the deployment was intentionally forced, Vercel correctly reported that the deployment itself was triggered without cache.

Observed Next.js optimized compilation: approximately 37.7 seconds.

Known non-blocking build warnings remain separate follow-up items:

- webpack cache serialization warnings for approximately 113 KiB and 268 KiB strings;
- `protobufjs` install-script allow-list warning;
- deprecated `node-domexception` transitive package warning;
- npm `cache-dir` environment configuration warning.

## First normal cache-enabled production build

Merge commit `ff9a00bd491148232a8a56f142c266080f797516` produced the first normal Git-triggered production deployment after the reserved cache-bypass key was archived.

Vercel explicitly reported:

- build cache restored from the preceding correctness-baseline deployment;
- dependency installation `up to date` in approximately 749 ms;
- Next.js optimized compilation completed in approximately 16.9 seconds;
- build completed successfully and created a new build cache for the next deployment;
- deployment reached READY.

Compared with the uncached 37.7-second optimized compilation baseline, the first cache-enabled compile was approximately 55% faster.

The prior 113 KiB and 268 KiB webpack cache-serialization warnings were not emitted during this restored-cache build. The `protobufjs` install-script warning and npm `cache-dir` warning remained and are tracked separately.

Post-deployment verification:

- `main` CI passed;
- CodeQL completed successfully;
- production runtime error window remained at zero;
- critical unauthenticated auth/recovery surfaces continued to return their expected secure states.

## Acceptance criteria for cache restoration

A normal Git-triggered production deployment must:

1. no longer report `VERCEL_FORCE_NO_BUILD_CACHE`;
2. restore/cache build artifacts normally;
3. pass CI and CodeQL and preserve Production Smoke behavior;
4. reach Vercel READY;
5. introduce no new production runtime errors.

The next normal production build is the repeat-cache measurement. It should restore cache from the first normal cache-enabled deployment and be compared against the 16.9-second compile above before this checkpoint is closed.
