# SalsysOS — Auth Refresh Stampede Hardening

**Date:** 2026-10-27

## Incident

A production sign-in attempt returned the fail-closed service-unavailable message while Supabase Auth `/token` and `/user` calls were timing out under request pressure.

The immediate application-side amplifier was traced to the Conversations WhatsApp composer:

- `quickReplies = []` created a new array on every render when the prop was omitted.
- the synchronization effect copied that new array into state, causing another render.
- the quick-reply loading effect depended on that changing array reference and repeatedly fetched `/api/whatsapp/quick-replies`.
- inbound message realtime events called `router.refresh()` after a 300 ms debounce, multiplying composer remounts while historical Instagram messages were being recovered.

## Mitigation

- Historical Instagram retry replay was temporarily unscheduled while Auth recovered.
- A Vercel Firewall rate limit was placed on `/api/whatsapp/quick-replies` as defense in depth.

## Permanent application fix

- Use a stable module-level empty quick-reply array.
- Allow the fallback quick-reply API load only once per composer mount.
- Depend on `quickReplies.length` instead of array identity for the fallback load.
- Rate-limit Conversations realtime `router.refresh()` to at most once every five seconds.
- Do not refresh hidden Conversations tabs.

## Recovery rule

Do not resume the historical Instagram replay at the previous cadence until this change is deployed to production and Auth is verified healthy. Resume conservatively, validate Auth and Vercel error rates, then increase only if the system remains healthy.
