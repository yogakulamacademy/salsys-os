# Yogakulam trusted checkout events

This guide wires Yogakulam's existing PHP checkout/payment system into SalsysOS authoritative business events.

## Security boundary

Use `integrations/php/salsys-server-events.php` **only from PHP/backend code**.

Configure these server-side values (environment or a private config outside public web files):

```text
SALSYS_SERVER_SOURCE_KEY=<Website backend source key>
SALSYS_SERVER_SECRET=<server secret shown by Salsys when the source is created/rotated>
```

Never put the server secret in JavaScript, HTML, form fields, Git, screenshots, or browser storage.

Browser Salsys tracking remains responsible for visits and lead/form capture. The server helper is only for authoritative booking/payment/enrollment outcomes.

---

## Stable identity and idempotency

Salsys resolves the CRM lead using this priority:

1. explicit trusted internal reference when available;
2. existing enrollment/booking entity reference;
3. prior lead event/session/visitor identity;
4. exact tenant-scoped email/phone match for secret-authenticated server sources.

Every event uses a stable event ID. Retrying the same event with the same ID is safe.

---

## 1. Reservation saved: booking.completed

**File:** Yogakulam `enroll-process.php`

**When:** only after the `enquiries` insert succeeds and `booking_reference` exists.

```php
require_once '/PRIVATE/PATH/salsys-server-events.php';

$result = salsys_booking_event(
    'booking.completed',
    $booking_reference,
    [
        'email' => $email,
        'phone' => $phone,
    ],
    [
        'course' => $course,
        'course_id' => $course_id,
        'currency' => $currency,
        'booking_value' => (float)($offer_price ?: $regular_price),
        'room_type' => $room_type,
        'start_date' => $start_date,
        'end_date' => $end_date,
    ],
    [
        'anonymous_visitor_id' => $_POST['salsys_visitor_id'] ?? null,
        'session_key' => $_POST['salsys_session_id'] ?? null,
        'metadata' => [
            'integration' => 'yogakulam_checkout',
            'checkout_stage' => 'reservation_saved',
        ],
    ]
);

if (!$result['ok']) {
    error_log('Salsys booking event failed [' . $booking_reference . ']: ' . ($result['error'] ?? 'unknown'));
}
```

Salsys failure must **not** roll back a valid Yogakulam reservation.

---

## 2. Payment record created: payment.started

**File:** checkout `create-payment.php` (or equivalent function that inserts the local pending payment row).

**When:** after the local `payments` row exists and has a stable `payment_reference`.

Use the **course subtotal/revenue amount**, not a PayPal/processor surcharge, as `amount`. Processing fees can be included in metadata.

```php
$result = salsys_payment_event(
    'payment.started',
    $paymentReference,
    $bookingReference,
    [
        'email' => $customerEmail,
        'phone' => $customerPhone,
    ],
    [
        'provider' => $gateway,
        'payment_kind' => $paymentPlan === 'deposit' ? 'deposit' : 'other',
        'amount' => (float)$subtotal,
        'currency' => $currency,
    ],
    [
        'metadata' => [
            'integration' => 'yogakulam_checkout',
            'processing_fee' => (float)$processingFee,
            'amount_payable' => (float)$amountPayable,
        ],
    ]
);
```

Do not emit `payment.completed` here.

---

## 3. PayPal verified/captured: payment.completed

**File:** PayPal webhook/capture path (`paypal-webhook.php` / the `markPayPalPaymentPaid(...)` success path).

**When:** only **after** the PayPal capture has been verified, the local payment row has been committed as `paid`, and the capture amount/currency/reference checks have passed.

```php
$paymentResult = salsys_payment_event(
    'payment.completed',
    $payment['payment_reference'],
    $payment['booking_reference'],
    [
        'email' => $payment['email'] ?? '',
        'phone' => $payment['phone'] ?? '',
    ],
    [
        'provider' => 'paypal',
        'payment_kind' => ($payment['payment_plan'] ?? '') === 'deposit' ? 'deposit' : 'other',
        'amount' => (float)$payment['subtotal'],
        'currency' => $payment['currency'],
    ],
    [
        'metadata' => [
            'integration' => 'yogakulam_checkout',
            'gateway_payment_id' => $captureId,
            'processing_fee' => (float)($payment['processing_fee'] ?? 0),
        ],
    ]
);
```

Then emit the enrollment outcome described below because Yogakulam treats a verified first payment/deposit as enrollment confirmation.

---

## 4. Direct UPI proof submitted: no completion event

**File:** Direct UPI proof submission handler.

Submitting a UTR/proof only means **verification pending**. Do not emit `payment.completed` or `enrollment.completed` here.

A pending `payment.started` event may already exist from payment creation.

---

## 5. Direct UPI admin verification: payment.completed

**File:** admin payment verification code that performs both:

```text
upi_payment_proofs.status = verified
payments.status = paid
```

**When:** immediately after the DB transaction commits successfully, before/after the confirmation email is fine.

Reload or retain the authoritative payment/customer row and call:

```php
$paymentResult = salsys_payment_event(
    'payment.completed',
    $paymentReference,
    $bookingRef,
    [
        'email' => $customerEmail,
        'phone' => $customerPhone,
    ],
    [
        'provider' => 'direct_upi',
        'payment_kind' => $paymentPlan === 'deposit' ? 'deposit' : 'other',
        'amount' => (float)$subtotal,
        'currency' => $currency,
    ],
    [
        'metadata' => [
            'integration' => 'yogakulam_checkout',
            'verified_by_admin' => true,
        ],
    ]
);
```

---

## 6. Enrollment confirmation: enrollment.completed

Yogakulam's current confirmation flow states that a verified first payment/deposit confirms enrollment. Therefore emit this immediately after the first authoritative paid payment for that booking.

Until Yogakulam has a separate enrollment number, use a deterministic external enrollment reference derived from the booking reference:

```php
$enrollmentReference = 'ENR-' . $bookingReference;
```

Then:

```php
$enrollmentResult = salsys_enrollment_completed(
    $enrollmentReference,
    $bookingReference,
    [
        'email' => $customerEmail,
        'phone' => $customerPhone,
    ],
    [
        'course_code' => $canonicalCourseCode ?? '',
        'course' => $courseName,
        'batch_code' => $batchCode ?? '',
        'batch' => $batchName ?? '',
        'total_value' => (float)$coursePrice,
        'currency' => $currency,
    ],
    [
        'metadata' => [
            'integration' => 'yogakulam_checkout',
            'confirmation_basis' => 'verified_payment',
        ],
    ]
);
```

The stable enrollment event ID is derived from `ENR-<booking_reference>`, so a PayPal webhook retry or repeated verification call will not duplicate the enrollment.

---

## 7. Failed payment

Only emit `payment.failed` when the gateway/backend has an authoritative failed payment attempt associated with the local `payment_reference`.

Use the same `salsys_payment_event(...)` helper with event name `payment.failed`.

---

## Not yet enabled: refunds

Do **not** emit `payment.refunded` yet. The current canonical payment processor supports `payment.started`, `payment.completed`, and `payment.failed`. Refund support should be added and tested separately before a website refund hook is enabled.

---

## Proof checklist

For the first controlled checkout test, verify in order:

1. trusted `Website backend` source `accepted_event_count` increases;
2. `booking.completed` creates a booking entity reference linked to the correct CRM lead;
3. `payment.started` creates/updates the pending payment row;
4. verified payment creates `payments.status = paid` in Salsys;
5. `enrollment.completed` creates the confirmed enrollment linked to the same lead/payment;
6. `v_lead_revenue_status` reflects the paid revenue;
7. `v_crm_source_revenue_30d` attributes that revenue to the lead's acquisition source/campaign;
8. first-touch attribution remains unchanged while revenue appears downstream.
