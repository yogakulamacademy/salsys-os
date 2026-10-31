<?php

declare(strict_types=1);

/**
 * Yogakulam verified payment -> SalsysOS enrollment completion adapter.
 *
 * Use this only AFTER a provider-specific handler has authoritatively verified
 * a payment and the local payments row has been committed as `paid`.
 *
 * Yogakulam's current commercial rule is that the first verified payment or
 * deposit confirms enrollment. The deterministic ENR-<booking_reference>
 * identity makes repeated provider callbacks and later balance-payment retries
 * idempotent in SalsysOS.
 *
 * This helper is deliberately fail-open. Tracking must never invalidate or
 * roll back a payment already confirmed by the website/payment provider.
 */

if (!function_exists('trackSalsysVerifiedPaymentEnrollment')) {
    function trackSalsysVerifiedPaymentEnrollment(
        array $payment,
        string $provider,
        string $verificationSource
    ): void {
        $bookingReference = trim((string)($payment['booking_reference'] ?? ''));
        $paymentReference = trim((string)($payment['payment_reference'] ?? ''));

        if ($bookingReference === '' || $paymentReference === '') {
            error_log('Salsys enrollment completion skipped: booking/payment reference missing.');
            return;
        }

        if (!function_exists('salsys_track_enrollment_completed')) {
            error_log(
                'Salsys enrollment.completed helper unavailable [' .
                $bookingReference .
                ']'
            );
            return;
        }

        $customer = [
            'email' => trim((string)($payment['email'] ?? '')),
            'phone' => trim((string)($payment['phone'] ?? '')),
        ];

        $courseCode = trim((string)(
            $payment['main_course_id']
            ?? $payment['course_id']
            ?? ''
        ));

        $courseName = trim((string)($payment['course'] ?? ''));
        $currency = strtoupper(trim((string)($payment['currency'] ?? '')));

        /*
         * `course_amount` is the website's course-value field available in the
         * verified PayPal/ICICI payment rows. Do not use `amount_payable` here:
         * it can include processor fees, and a deposit represents only the
         * current payment rather than the enrollment's course value.
         *
         * If course_amount is absent/zero, omit total_value rather than invent
         * a value. The enrollment identity and opportunity linkage remain
         * authoritative without a fabricated amount.
         */
        $courseValue = (float)($payment['course_amount'] ?? 0);

        $enrollment = [
            'course_code' => $courseCode,
            'course' => $courseName,
            'currency' => $currency,
        ];

        if ($courseValue > 0) {
            $enrollment['total_value'] = $courseValue;
        }

        try {
            $result = salsys_track_enrollment_completed(
                'ENR-' . $bookingReference,
                $bookingReference,
                $customer,
                $enrollment,
                [
                    'metadata' => [
                        'integration' => 'yogakulam_checkout',
                        'confirmation_basis' => 'verified_payment',
                        'payment_reference' => $paymentReference,
                        'payment_provider' => trim($provider),
                        'verification_source' => trim($verificationSource),
                        'payment_kind' => trim((string)($payment['payment_plan'] ?? '')),
                    ],
                ]
            );

            if (!is_array($result) || empty($result['ok'])) {
                error_log(
                    'Salsys enrollment.completed failed [' .
                    $bookingReference .
                    ']: ' .
                    (
                        is_array($result)
                            ? (string)($result['error'] ?? 'unknown')
                            : 'invalid helper response'
                    )
                );
            }
        } catch (Throwable $e) {
            error_log(
                'Salsys enrollment.completed exception [' .
                $bookingReference .
                ']: ' .
                $e->getMessage()
            );
        }
    }
}

/*
 * PayPal verified return/webhook integration point:
 *
 *   trackSalsysPaypalCompleted($payment);
 *   trackSalsysVerifiedPaymentEnrollment(
 *       $payment,
 *       'paypal',
 *       'paypal_capture'
 *   );
 *
 * ICICI verified callback/reconciliation integration point:
 *
 *   trackSalsysIciciCompleted($payment);
 *   trackSalsysVerifiedPaymentEnrollment(
 *       $payment,
 *       'icici',
 *       'icici_securehash_return'
 *   );
 *
 * The adapter should be loaded server-side alongside salsys-tracking.php.
 * Never expose SALSYS_SERVER_SECRET to browser JavaScript or commit it here.
 */
