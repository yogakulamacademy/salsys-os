# SalsysOS

A multi-tenant Sales + Analysis Operating System for lead management, sales execution, customer journey intelligence, marketing attribution and revenue analytics.

## v0.6 milestone

The CRM now adds production-ready website tracking and automatic server-to-server lead capture on top of the live admissions CRM.


### New in v0.6
- Secure `/api/leads/capture` endpoint for academy website PHP backends.
- Idempotent website submissions using stable external enquiry IDs.
- Automatic duplicate matching by normalized email/phone.
- Anonymous website journey → known CRM lead linking that persists for future sessions/events.
- `visitor_identity_links` and `lead_ingest_events` operational tables.
- Website capture + 7-day web-funnel health views on `/tracking`.
- Automatic WhatsApp / Instagram / email / phone / booking CTA click detection.
- `form_start` measurement for marked enquiry forms.
- Reusable PHP integration helper in `integrations/php/`.
- Existing Supabase Realtime admissions operations from v0.5 remain enabled.

This version is intended for controlled production testing on one website enquiry flow before the tracker is rolled out site-wide.

### Existing tracking foundation from v0.3
- Anonymous visitor + session IDs.
- First-touch and current-session UTM capture.
- GCLID / GBRAID / WBRAID / FBCLID capture.
- Google campaign/ad-group/creative ID fields when passed through URL parameters.
- Cross-origin website event collector with an origin allowlist.
- Page-view and tagged CTA event tracking.
- Consent-gated tracker by default.
- Hidden tracking fields for public lead forms.
- Server-to-server anonymous-journey → CRM-lead linking.
- Automatic first/last/lead-creation/conversion attribution refresh.
- `/tracking` health/setup screen.
- Live first-touch source mix on `/attribution`.

Instagram/WhatsApp message ingestion and Claude agent automation remain intentionally off for now.

---

## 1. Install and run in mock mode

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

The default is:

```env
NEXT_PUBLIC_USE_MOCK_DATA=true
```

---

## 2. Create a Supabase project

Create a new Supabase project, then open **SQL Editor**.

Run these migrations in order:

```text
supabase/migrations/001_initial_crm.sql
supabase/migrations/002_live_crm_auth_and_mutations.sql
supabase/migrations/003_first_party_tracking.sql
supabase/migrations/004_course_catalog_and_batches.sql   # optional for maintained batch catalog
supabase/migrations/005_realtime_operations.sql
supabase/migrations/006_website_lead_capture.sql
```

Migration `002` adds the live-auth hardening and real CRM mutations used by v0.2.

### Optional fictional database records

You can then run:

```text
supabase/seed.sql
```

The seed file contains development data only.

---

## 3. Create the first CRM administrator

In **Supabase → Authentication → Users**, create your first user with email/password.

Copy that user's UUID, then run this in SQL Editor:

```sql
insert into public.profiles (id, full_name, role)
values ('<AUTH_USER_UUID>', 'Admin User', 'admin');
```

Roles currently supported:

```text
admin
manager
admissions
analyst
viewer
```

`admin`, `manager` and `admissions` can write CRM records. Active CRM users can read CRM data. Role administration should stay server/admin-controlled.

---

## 4. Configure `.env.local`

Use the browser-safe project values from Supabase's **Connect / API** screen:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_USE_MOCK_DATA=false
```

For v0.3 tracking ingestion, also configure server-only values:

```env
SUPABASE_SECRET_KEY=sb_secret_...
TRACKING_ALLOWED_ORIGINS=https://www.yogakulam.com,https://yogakulam.com,https://www.yogakulamacademy.com,https://yogakulamacademy.com
TRACKING_INGEST_SECRET=<long-random-secret>
WEBSITE_LEAD_CAPTURE_SECRET=<second-long-random-secret>
```

See `docs/v06-website-integration.md` for the current public-site, GTM and PHP lead-capture setup.

Legacy Supabase projects can use:

```env
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

The app accepts either `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or the legacy anon key.

**Never put a Supabase service-role/secret key in a `NEXT_PUBLIC_...` variable or browser code.**

Restart the Next.js development server after changing environment variables.

---

## 5. Test the live CRM

Use this sequence:

1. Open `/dashboard` while signed out → you should be redirected to `/login`.
2. Sign in with the Supabase Auth user you created.
3. Open `/leads/new` and create a lead.
4. Open the lead and verify attribution + initial stage history.
5. Open **Edit lead** and change course/location/intent/channel.
6. Change the funnel stage from the lead page.
7. Confirm a new row appears in `lead_stage_history`.
8. Schedule a follow-up from the lead page.
9. Open `/follow-ups` when the follow-up is due and mark it complete.
10. Sign out and verify protected CRM routes require login again.

Useful SQL checks:

```sql
select * from public.v_leads_overview order by created_at desc;
select * from public.v_pipeline_counts;
select * from public.lead_stage_history order by changed_at desc;
select * from public.tasks order by created_at desc;
select * from public.v_followups_due order by due_at;
```

---

## Important CRM behavior

### Funnel stage changes

Use `set_lead_stage()` instead of directly editing `current_stage` from application workflows. The RPC updates the lead and records the movement in `lead_stage_history` atomically.

### Lead creation

`create_crm_lead()` creates the lead, contact identities, attribution record and lead-created activity in one transaction. Duplicate normalized email/phone identities intentionally fail rather than silently creating an unlinked duplicate.

### Follow-ups

`create_followup_task()` creates the task and keeps `leads.next_followup_at` synchronized.

`complete_followup_task()` completes the task and recalculates the lead's next open follow-up.

### RLS-safe views

Migration `002` recreates the CRM views with PostgreSQL `security_invoker = true`, so their queries obey the Row Level Security policies of the underlying tables.

---

## Current routes

```text
/login
/dashboard
/leads
/leads/new
/leads/[id]
/leads/[id]/edit
/pipeline
/conversations
/follow-ups
/campaigns
/attribution
/tracking
/analytics
/settings
```

---

## Current database model

Core records:

```text
profiles
courses
course_batches
leads
lead_contacts
lead_stage_history
activities
tasks
conversations
messages
campaigns
ads
ad_spend_daily
web_sessions
touchpoints
lead_attribution
payments
enrollments
response_templates
```

---

## Next milestone

After v0.6 is validated on real website enquiries:

1. Instagram Messaging API webhooks → conversations/messages.
2. WhatsApp Cloud API webhooks → conversations/messages.
3. Identity merging across website / Instagram / WhatsApp.
4. Payment/enrollment conversion events back into attribution.
5. Only after the data path is stable: Claude qualification/reply Skills + MCP.

---

## v0.4 course + batch upgrade

Run `supabase/migrations/004_course_catalog_and_batches.sql` after migrations 001–003. The Add/Edit Lead form now filters upcoming batches by the selected course and auto-fills location, preferred month, delivery mode and timezone from the selected batch. See `docs/v04-course-batches.md`.


---

## v0.5 real-time testing

After running migration `005_realtime_operations.sql`, open the CRM in two browser tabs.

1. Create or open a real lead.
2. On the lead page, use **Log interaction** to record an outbound WhatsApp/Instagram/phone/email touch.
3. The first outbound interaction on a `new` lead automatically assists the funnel to `contacted`.
4. Log an inbound reply. A `new` or `contacted` lead is assisted to `engaged`.
5. Open `/conversations` to see the same stored message history.
6. Schedule a follow-up, then use `/follow-ups` to complete or snooze it.
7. Keep `/dashboard` open in another tab. The **Live sync** indicator should turn green and the view should refresh when CRM records change.

The interaction logger is deliberately a **log**, not a sender. It lets the academy test the full CRM process with real leads while staff continue sending actual messages through Instagram/WhatsApp manually. Later, Meta webhooks and send APIs will write into the same tables automatically.
