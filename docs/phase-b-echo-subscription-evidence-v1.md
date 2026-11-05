# Phase B — Instagram outbound echo subscription evidence (v1)

## Scope

This checkpoint adds a small **on-demand**, read-only Meta subscription evidence control to
`/system-health/message-sync`. It reuses the existing owner/admin-only
`POST /api/instagram/history-sync` route in `mode: echo_status`, which in turn
calls Meta's `GET /me/subscribed_apps` with the account's existing encrypted
server-side token.

No Meta subscription POST, customer DM, import, webhook retry, scheduled job,
database migration, environment flag, AI request, CRM stage or payment mutation
is added.

## Authorization and privacy

1. Existing message-sync audit authenticates the current user, verifies their
   active profile, current organization, live membership and owner/admin role
   before creating any service client.
2. An additional service-client query selects **only connection IDs**, bounded
   to ten connected Instagram accounts and to the active organization.
3. The client displays generic labels ('Instagram connection 1', etc.), not
   customer information, account identifiers, access tokens or provider raw data.
4. Clicking a check uses the existing same-origin POST route. It repeats
   owner/admin authorization and organization+connection validation before
   retrieving a server-side token.
5. A failed or malformed provider response is **unknown/unavailable**, not
   proof that the account is disconnected or unsubscribed.

## Interpreting results safely

- `message_echoes` present: Meta reports that webhook field as subscribed;
  **this is not proof of actual app-message delivery**.
- `messages` present but `message_echoes` absent: Meta reports incoming
  message subscription, not confirmed native-app echo capture. Depending on
  the connected Meta product/flow, echo payloads may differ; use a live test.
- Neither present: the observed subscription list contains neither field.
  Meta app configuration, permission, login flow and account scope require review.
- Request fails: unknown — no negative inference.

The existing parser still only processes outgoing echoes when
`INSTAGRAM_OUTBOUND_ECHO_ENABLED=true`. This PR deliberately leaves it OFF.

## Release gate and live acceptance

1. TypeScript, existing message-sync tests, new echo evidence tests, build
   and CodeQL must pass.
2. Verify a signed-in owner/admin sees only the active tenant's account
   check controls, while employees/viewers are denied.
3. Click **Check Meta subscription** for each connected account. The response
   must not change any provider or CRM data.
4. Verify actual app Webhook configuration, callback and permissions in Meta.
   Do not assume `message_echoes` is available in every login/product flow:
   record the returned field list and resolve discrepancies before activation.
5. Confirm the dedicated outbound-echo retry migration and job are separately
   reviewed and approved; the production audit previously found them absent.
6. Use a permitted existing Instagram conversation to send a new native-app
   reply, then verify one canonical CRM outbound message with the exact
   provider message ID and correct thread/tenant. Test dedupe, timestamps,
   media and unsupported/unknown account cases.
7. Only after provider and identity acceptance should an authorized operator
   deliberately enable the app parser and redeploy.

No claimed historical completeness, no automatic remediation or replay.
