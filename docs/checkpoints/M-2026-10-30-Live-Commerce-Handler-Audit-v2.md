# Live Commerce Handler Audit v2

Date: 2026-10-30
Branch: `phase-6a-violet-foundation`

## Purpose

This checkpoint records the source-backed audit of the most recent saved Yogakulam payment handlers before live commerce completion wiring.

The goal is to complete the authoritative chain:

`booking.completed -> payment.started -> payment.completed -> enrollment.completed`

No browser-side payment state is authoritative. Completion tracking must run only after provider/admin verification and after the local paid transaction has committed.

## Current Salsys tracking helper contract

The saved current helper exposes:

```php
salsys_track_payment_completed(
    string $paymentReference,
    string $bookingReference,
    array $customer,
    array $payment,
    array $options = []
): array
```

and:

```php
salsys_track_enrollment_completed(
    string $enrollmentReference,
    string $bookingReference,
    array $customer,
    array $enrollment,
    array $options = []
): array
```

The enrollment helper accepts `course_code`, `course`, optional `batch_code`, optional `batch`, optional `total_value`, and `currency`.

## PayPal handler audit

Saved handler: `Pasted text(20261027-123913).txt`.

Verified behavior:

- Loads `/private/salsys-env.php` and `/includes/salsys/salsys-tracking.php` server-side.
- Existing `trackSalsysPaypalCompleted($payment)` uses business `subtotal`, not processor-inclusive `amount_payable`.
- Fresh successful path verifies PayPal, updates local payment to `paid`, finalizes coupon/bonus state, commits the database transaction, then calls `trackSalsysPaypalCompleted($payment)`.
- Already-paid/idempotent path also calls `trackSalsysPaypalCompleted($payment)`.

Required live edit:

1. Deploy `/includes/salsys/yogakulam-verified-payment-enrollment.php` from `integrations/php/yogakulam-verified-payment-enrollment.php`.
2. Load it after the existing Salsys env/tracking helper.
3. Immediately after every authoritative `trackSalsysPaypalCompleted($payment)` call, call:

```php
if (function_exists('trackSalsysVerifiedPaymentEnrollment')) {
    trackSalsysVerifiedPaymentEnrollment(
        $payment,
        'paypal',
        'paypal_capture'
    );
}
```

Do not move the PayPal verification or database commit boundary.

## ICICI handler audit

Saved handler: `Pasted text(20261028-045730).txt`.

Verified behavior:

- Loads `/private/salsys-env.php` and `/includes/salsys/salsys-tracking.php` server-side.
- Existing `trackSalsysIciciCompleted($payment)` uses business `subtotal`.
- Fresh successful path verifies SecureHash, currency, payment reference, booking reference, amount, response code and return reference, updates local payment to `paid`, finalizes coupon/bonus state, commits, then enters the authoritative Salsys completion block.
- Already-paid/idempotent path also calls the existing completion helper.

Required live edit:

1. Load the same `/includes/salsys/yogakulam-verified-payment-enrollment.php` adapter after the existing Salsys tracking helper.
2. Immediately after every authoritative `trackSalsysIciciCompleted($payment)` call, call:

```php
if (function_exists('trackSalsysVerifiedPaymentEnrollment')) {
    trackSalsysVerifiedPaymentEnrollment(
        $payment,
        'icici',
        'icici_securehash_return'
    );
}
```

Do not weaken any ICICI verification checks or move the commit boundary.

## Direct UPI admin verifier audit

Saved handler: `Pasted text(20261016-084042).txt`.

Verified behavior:

- Locks the Direct UPI payment row and proof.
- Requires INR.
- Rejects already-paid payments and already-verified/non-submitted proofs.
- Recalculates the current booking balance before verification.
- Uses `payments.subtotal` as the business/course amount.
- Marks `upi_payment_proofs.status = 'verified'` and `payments.status = 'paid'` in the transaction.
- Commits before confirmation email/redirect.
- No Salsys completion call exists in the saved handler.

### Canonical booking reload query

For this saved live revision, use **`$bookingInfoSql` only** for the post-commit Salsys booking reload.

Do **not** use `$accountSql` for the adapter payload.

Reason:

`$bookingInfoSql` exposes the exact fields required by `trackSalsysDirectUpiCompleted()`:

- `booking_reference`
- `email`
- `phone`
- `course`
- `course_id`
- `currency`
- `regular_price`
- `offer_price`

By contrast, `$accountSql` renames or omits several of those fields (`student_email`, `course_name`, calculated `course_fee`, no phone/course_id/offer_price/regular_price), so passing an `$accountSql` row would silently degrade enrollment/customer data.

### Required live Direct UPI includes

Deploy `/includes/salsys/yogakulam-direct-upi-completion.php` from `integrations/php/yogakulam-direct-upi-completion.php` and load, fail-open:

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
    error_log('Salsys Direct UPI tracking files unavailable.');
}

if (file_exists($salsysDirectUpiAdapter)) {
    require_once $salsysDirectUpiAdapter;
} else {
    error_log('Salsys Direct UPI completion adapter unavailable.');
}
```

### Required live Direct UPI post-commit call

Immediately after the verified UPI `$pdo->commit()` and before confirmation email/redirect:

```php
if (function_exists('trackSalsysDirectUpiCompleted')) {
    try {
        $salsysBookingStmt = $pdo->prepare("
            SELECT *
            FROM (
                $bookingInfoSql
            ) booking_info
            WHERE booking_reference = ?
            LIMIT 1
        ");

        $salsysBookingStmt->execute([
            $bookingRef
        ]);

        $salsysBooking =
            $salsysBookingStmt->fetch(PDO::FETCH_ASSOC) ?: [];

        trackSalsysDirectUpiCompleted(
            $pdo,
            array_merge(
                $upiPayment,
                [
                    'payment_reference' => $paymentReference,
                    'booking_reference' => $bookingRef,
                    'status' => 'paid',
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

This block must remain post-commit and fail-open.

## Direct UPI payment-kind normalization

The saved Direct UPI payment row includes `payment_plan`. The branch adapter now preserves canonical `deposit`, `balance`, and `full` values instead of collapsing every non-deposit payment to `other`.

Commit: `ccefe646488abf263042d2be86e5f0ac2dffaaa0`

## Enrollment value rules

PayPal/ICICI:

- `course_amount` is the enrollment total-value source when positive.
- Never use `amount_payable` because it may include processor surcharge.
- Never use the current deposit subtotal as the full enrollment value.

Direct UPI:

- Use `offer_price` when positive; otherwise `regular_price` from `$bookingInfoSql`.
- Use `subtotal` only for the `payment.completed` business amount.

## Live-host limitation

This repository/agent environment does not have Hostinger web-host filesystem/SFTP access. The audited PHP edits therefore cannot be applied directly to the live Yogakulam host from this environment.

Do not call commerce production-proven until these server-side edits are deployed to the live website and a controlled verified payment produces both completion events.

## Controlled production verification

After live deployment, run one controlled verified payment and require:

```text
booking.completed
payment.started
payment.completed
enrollment.completed
```

Then verify:

- raw event processing succeeds;
- Payment is linked to the correct opportunity/booking;
- Enrollment identity is `ENR-<booking_reference>` and is not duplicated on retry;
- revenue uses business subtotal and excludes processor surcharge;
- Customer 360 shows the payment/enrollment journey;
- funnel/attribution receives the completed commerce path;
- System Health has no new processing failures.
