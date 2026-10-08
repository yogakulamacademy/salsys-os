# SalsysOS v0.6 — Website Tracking + Automatic Lead Capture

This milestone connects the live Vercel CRM to `yogakulam.com` / `yogakulamacademy.com` without replacing the academy website's existing forms or database.

## Data flow

```text
Google / Meta / Organic / Referral
              ↓
       Yogakulam website
              ↓
      first-party tracker
              ↓
 page views / UTM / click IDs / CTA clicks / form start
              ↓
 existing website form handler + website database
              ↓
 secure server-to-server POST
              ↓
       /api/leads/capture
              ↓
        Supabase CRM lead
              ↓
 historical anonymous journey attached to the lead
```

The website database remains independent. CRM capture happens **after** the website successfully saves the enquiry.

---

## 1. Run migration 006

In Supabase SQL Editor run:

```text
supabase/migrations/006_website_lead_capture.sql
```

It adds:

- `visitor_identity_links`
- `lead_ingest_events`
- `ingest_website_lead(...)`
- `v_website_capture_health`
- `v_web_funnel_7d`

It also keeps future website events attached to a visitor after that visitor becomes a known CRM lead.

---

## 2. Add a new Vercel server secret

Generate a random secret locally:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add the result to Vercel:

```text
WEBSITE_LEAD_CAPTURE_SECRET=<generated value>
```

Type: **Secret**

Environment: **Production** (and Preview only if you intentionally test website → preview deployments)

Redeploy after adding/changing this variable.

Use the same value on the academy website server as:

```text
YOGAKULAM_CRM_WEBSITE_SECRET
```

Do not place this value in HTML, JavaScript, GTM or browser code.

---

## 3. Confirm Vercel origins

`TRACKING_ALLOWED_ORIGINS` should include the production website origins:

```text
https://www.yogakulam.com,https://yogakulam.com,https://www.yogakulamacademy.com,https://yogakulamacademy.com
```

---

## 4. Install the first-party tracker

Use your real Vercel CRM URL:

```html
<script
  src="https://YOUR-CRM.vercel.app/yogakulam-tracker.js"
  data-endpoint="https://YOUR-CRM.vercel.app/api/tracking/collect"
  data-site="yogakulamacademy.com"
  data-consent-mode="required"
  defer>
</script>
```

Install on all public pages, either directly in the site layout/header or through Google Tag Manager.

### Consent

Production default should remain:

```text
data-consent-mode="required"
```

When the site's consent manager grants analytics consent, dispatch:

```js
window.dispatchEvent(new CustomEvent('yk:consent', {
  detail: { analytics: true }
}));
```

When revoked:

```js
window.dispatchEvent(new CustomEvent('yk:consent', {
  detail: { analytics: false }
}));
```

For short internal/staging tests only, `data-consent-mode="granted"` can be used. Do not use that as the production default where consent is required.

---

## 5. Mark enquiry forms

Add `data-yk-lead-form` to enquiry/reservation forms that should be connected to the CRM:

```html
<form method="post" data-yk-lead-form>
  ... existing Yogakulam fields ...
</form>
```

The tracker automatically adds these hidden fields after analytics consent:

```text
yk_visitor_id
yk_session_id
yk_first_touch
yk_session_touch
```

It also records `form_start` and `lead_form_submit` events.

---

## 6. Add CRM capture to the existing PHP handler

Copy:

```text
integrations/php/yogakulam-crm.php
```

to a non-public include/config area on the academy website server.

Configure server environment values:

```text
YOGAKULAM_CRM_URL=https://YOUR-CRM.vercel.app
YOGAKULAM_CRM_WEBSITE_SECRET=<same random secret as Vercel>
```

Then, **after your existing form is validated and saved to the academy database**, call the helper. See:

```text
integrations/php/example-after-form-save.php
```

The most important field is:

```php
'externalEventId' => 'academy-enquiry-' . $websiteEnquiryId
```

Use the existing website enquiry/database row ID whenever possible. It makes retries idempotent.

---

## 7. Field mapping

The capture endpoint supports:

```text
externalEventId        required stable submission ID
site
formName
firstName
lastName
email
phone
courseCode
preferredLocation
preferredMonth         YYYY-MM or YYYY-MM-DD
preferredMode
country
timezone
message
anonymousVisitorId / yk_visitor_id
sessionKey / yk_session_id
firstTouch / yk_first_touch
sessionTouch / yk_session_touch
metadata
```

`courseCode` should match `courses.code` in Supabase when supplied.

---

## 8. Duplicate behavior

The same `externalEventId` can be retried safely. It returns the already processed lead.

A new website submission with an email/phone already in `lead_contacts` is attached to that existing lead instead of creating a duplicate.

If the email belongs to one lead and the phone belongs to another lead, the endpoint rejects the submission for manual review rather than guessing.

---

## 9. Automatic CTA tracking

v0.6 automatically records clicks to common contact/conversion destinations even without custom attributes:

```text
WhatsApp links      → whatsapp_click
Instagram links     → instagram_click
mailto:             → email_click
tel:                → phone_click
URLs containing enrol/enroll/reservation/reserve/book/booking
                    → enrollment_cta_click
```

For custom buttons, keep using explicit attributes:

```html
<a
  href="https://wa.me/..."
  data-yk-event="whatsapp_click"
  data-yk-channel="whatsapp"
  data-yk-label="200H Mysore WhatsApp">
  Enquire on WhatsApp
</a>
```

---

## 10. Test before installing on every page

Start with one enquiry page.

1. Open it with a test UTM URL, for example:

```text
https://www.yogakulamacademy.com/test-page.php?utm_source=crm_test&utm_medium=test&utm_campaign=v06_test
```

2. Grant analytics consent.
3. Open the CRM `/tracking` page and confirm page-view activity.
4. Focus a marked form field and confirm a `form_start` event.
5. Submit a real test enquiry.
6. Confirm the website's existing form/database works normally.
7. Confirm a lead appears automatically in `/leads`.
8. Open the lead and confirm the timeline contains the website journey + lead creation.
9. Submit the same test again with the same `externalEventId`; no duplicate lead should be created.

---

## 11. Direct endpoint test without modifying the website

After migration 006 is run and `WEBSITE_LEAD_CAPTURE_SECRET` is configured on Vercel, you can test the capture API from PowerShell:

```powershell
$headers = @{ "X-Website-Secret" = "YOUR_SECRET" }
$body = @{
  externalEventId = "manual-test-001"
  site = "yogakulamacademy.com"
  formName = "manual-test"
  firstName = "CRM Test"
  email = "crm-test@example.com"
  message = "Testing automatic website lead capture"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "https://YOUR-CRM.vercel.app/api/leads/capture" `
  -Method Post `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body
```

Expected response:

```json
{
  "ok": true,
  "created": true,
  "matched_existing": false,
  "lead_id": "...",
  "lead_code": "LD-..."
}
```

Delete the test lead afterward if you do not want it in production data.

---

## Important security rule

The website capture secret is strictly server-to-server:

```text
Academy PHP server → CRM API
```

Never:

```text
Browser JavaScript → secret
GTM → secret
HTML hidden input → secret
public GitHub source → secret
```
