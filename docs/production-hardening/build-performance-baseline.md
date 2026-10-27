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

## Acceptance criteria for cache restoration

A normal Git-triggered production deployment must:

1. no longer report `VERCEL_FORCE_NO_BUILD_CACHE`;
2. restore/cache build artifacts normally;
3. pass CI, CodeQL, and Production Smoke;
4. reach Vercel READY;
5. introduce no new production runtime errors.

A following normal production build should be compared against the first normal build to confirm actual cache reuse and quantify the improvement.
