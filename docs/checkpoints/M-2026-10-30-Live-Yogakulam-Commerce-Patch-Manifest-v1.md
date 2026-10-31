# Live Yogakulam Commerce Patch Manifest v1

Date: 2026-10-30
Branch: `phase-6a-violet-foundation`

## Purpose

This checkpoint records the exact live-host edits still required to complete the authoritative Yogakulam commerce chain:

`booking.completed -> payment.started -> payment.completed -> enrollment.completed`

The SalsysOS ingestion/projector side is already implemented. The remaining work is to wire the verified-success calls into the live Yogakulam PHP handlers.

## Safety rules

- Emit completion only after the local payment has been authoritatively verified and committed as `paid`.
- Never emit completion from a browser confirmation page.
- Never emit completion from an unverified Direct UPI proof upload.
- Tracking must be fail-open: a Salsys failure must never roll back or block a verified bank/payment transaction.
- Reuse the existing stable `payment_reference` for payment completion.
- Use deterministic `ENR-<booking_reference>` for enrollment completion.
- Do not send processor fees/surcharges as business revenue.

## Website helper files to deploy

Copy these validated SalsysOS adapter files to the Yogakulam website under the existing server-only Salsys include area (recommended: `/includes/salsys/`):

1. `integrations/php/yogakulam-verified-payment-enrollment.php`
2. `integrations/php/yogakulam-direct-upi-completion.php`

The website already loads:

- `/private/salsys-env.php`
- `/includes/salsys/salsys-tracking.php`

Do not expose `SALSYS_SERVER_SECRET` in any public repository or browser code.

---

# 1. PayPal verified-success handler

## Existing verified behavior

The saved PayPal handler already calls:

```php
trackSalsysPaypalCompleted(
    $payment
);
```

both for an already-paid idempotent path and after the verified capture/local paid commit.

## Add adapter include

After the existing Salsys tracking helper has been loaded, add:

```php
$salsysEnrollmentAdapter =
    $_SERVER['DOCUMENT_ROOT'] .
    '/includes/salsys/yogakulam-verified-payment-enrollment.php';

if (file_exists($salsysEnrollmentAdapter)) {
    require_once $salsysEnrollmentAdapter;
} else {
    error_log(
        'Salsys verified payment enrollment adapter unavailable.'
    );
}
```

## Add enrollment call after every authoritative PayPal completion call

Immediately after:

```php
trackSalsysPaypalCompleted(
    $payment
);
```

add:

```php
if (
    function_exists(
        'trackSalsysVerifiedPaymentEnrollment'
    )
) {
    trackSalsysVerifiedPaymentEnrollment(
        $payment,
        'paypal',
        'paypal_capture'
    );
}
```

This must be present in both:

1. the already-paid/idempotent path; and
2. the fresh verified-capture path after the local transaction has committed.

Do not move the payment verification or DB commit boundaries.

---

# 2. ICICI verified return handler

## Existing verified behavior

The saved ICICI handler already verifies the return, commits the local payment as paid, then calls:

```php
trackSalsysIciciCompleted(
    $payment
);
```

It also calls the same helper in the already-paid idempotent path.

## Add adapter include

After the existing Salsys tracking helper has been loaded, add:

```php
$salsysEnrollmentAdapter =
    $_SERVER['DOCUMENT_ROOT'] .
    '/includes/salsys/yogakulam-verified-payment-enrollment.php';

if (file_exists($salsysEnrollmentAdapter)) {
    require_once $salsysEnrollmentAdapter;
} else {
    error_log(
        'Salsys verified payment enrollment adapter unavailable.'
    );
}
```

## Add enrollment call after every authoritative ICICI completion call

Immediately after:

```php
trackSalsysIciciCompleted(
    $payment
);
```

add:

```php
if (
    function_exists(
        'trackSalsysVerifiedPaymentEnrollment'
    )
) {
    trackSalsysVerifiedPaymentEnrollment(
        $payment,
        'icici',
        'icici_securehash_return'
    );
}
```

This must be present in both:

1. the already-paid/idempotent path; and
2. the fresh verified-return path immediately after the local commit and existing `trackSalsysIciciCompleted()` call.

Do not weaken any existing SecureHash, currency, payment-reference, booking-reference, amount, response-code or RetRefNo validation.

---

# 3. Direct UPI admin verification handler (`/admin/payments.php`)

## Existing verified behavior

The saved handler currently performs:

1. proof status validation;
2. current booking balance recalculation;
3. `upi_payment_proofs.status = 'verified'`;
4. `payments.status = 'paid'`;
5. `$pdo->commit()`;
6. confirmation email;
7. redirect.

No Salsys payment-completion call exists between steps 5 and 6.

## Add Salsys includes

At server bootstrap level (before the verification action can run), load the existing private env/tracking helper and the Direct UPI adapter:

```php
$salsysEnvPath =
    dirname($_SERVER['DOCUMENT_ROOT']) .
    '/private/salsys-env.php';

$salsysTrackingPath =
    $_SERVER['DOCUMENT_ROOT'] .
    '/includes/salsys/salsys-tracking.php';

$salsysDirectUpiAdapter =
    $_SERVER['DOCUMENT_ROOT'] .
    '/includes/salsys/yogakulam-direct-upi-completion.php';

if (
    file_exists($salsysEnvPath) &&
    file_exists($salsysTrackingPath)
) {
    require_once $salsysEnvPath;
    require_once $salsysTrackingPath;
} else {
    error_log(
        'Salsys Direct UPI tracking files unavailable.'
    );
}

if (file_exists($salsysDirectUpiAdapter)) {
    require_once $salsysDirectUpiAdapter;
} else {
    error_log(
        'Salsys Direct UPI completion adapter unavailable.'
    );
}
```

Tracking includes must remain fail-open. Do not abort admin payment verification merely because Salsys files are unavailable.

## Add post-commit authoritative completion call

Immediately after the existing:

```php
$pdo->commit();
```

and before confirmation email/redirect, reload the current booking row using the existing booking-account query already available in the page, then call the adapter.

Use the page's existing canonical booking query variable (`$accountSql` or `$bookingInfoSql`, whichever exists in the deployed revision). Example using `$accountSql`:

```php
if (
    function_exists(
        'trackSalsysDirectUpiCompleted'
    )
) {
    try {
        $salsysBookingStmt = $pdo->prepare("
            SELECT *
            FROM (
                $accountSql
            ) booking_info
            WHERE booking_reference = ?
            LIMIT 1
        ");

        $salsysBookingStmt->execute([
            $bookingRef
        ]);

        $salsysBooking =
            $salsysBookingStmt->fetch(
                PDO::FETCH_ASSOC
            ) ?: [];

        trackSalsysDirectUpiCompleted(
            $pdo,
            array_merge(
                $upiPayment,
                [
                    'payment_reference' =>
                        $paymentReference,
                    'booking_reference' =>
                        $bookingRef,
                    'status' =>
                        'paid',
                ]
            ),
            $salsysBooking
        );

    } catch (Throwable $trackingError) {
        error_log(
            'Salsys Direct UPI completion exception [' .
            $paymentReference .
            ']: ' .
            $trackingError->getMessage()
        );
    }
}
```

Important: this block runs only after the DB commit. It must never cause a rollback or change the already-verified payment result.

---

# 4. Deployment verification

After deploying the live PHP edits, perform one controlled verified payment path.

Expected raw event sequence:

```text
booking.completed
payment.started
payment.completed
enrollment.completed
```

Expected Salsys projections:

- Payment record exists and is linked to the booking/opportunity.
- Enrollment exists using deterministic identity `ENR-<booking_reference>`.
- Revenue surfaces the business subtotal, excluding processor surcharge.
- Customer 360 shows the payment/enrollment journey.
- Funnel/attribution can consume the completed commerce events.
- System Health has no new raw-event processing failures.

## Idempotency verification

Replay/revisit the successful callback/handler where safe and verify:

- no duplicate Payment is created;
- no duplicate Enrollment is created;
- the stable payment reference remains the same;
- `ENR-<booking_reference>` remains the enrollment identity.

---

# 5. Current production baseline before deployment

At the time of this checkpoint, production durable-event counts are:

```text
booking.completed      14
payment.started         2
payment.completed       0
enrollment.completed    0
```

Therefore a successful live deployment/test must increase both completion counts above zero.

## Release interpretation

The SalsysOS release branch can remain merge-ready independently of the external website deployment, but commerce should not be called production-proven until a real verified transaction produces both `payment.completed` and `enrollment.completed` in production.