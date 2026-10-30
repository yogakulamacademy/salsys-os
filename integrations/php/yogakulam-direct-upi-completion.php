<?php

declare(strict_types=1);

/**
 * Yogakulam Direct UPI -> SalsysOS authoritative completion adapter.
 *
 * This file is an integration reference for the live Yogakulam admin payment
 * verification path. It must be called only AFTER the local transaction has
 * successfully committed both:
 *
 *   upi_payment_proofs.status = 'verified'
 *   payments.status = 'paid'
 *
 * Tracking is deliberately fail-open: SalsysOS must never roll back or block
 * a bank payment that Yogakulam has already verified and committed.
 *
 * Expected website helper functions (from /includes/salsys/salsys-tracking.php):
 *   salsys_track_payment_completed(...)
 *   salsys_track_enrollment_completed(...)
 */

if (!function_exists('trackSalsysDirectUpiCompleted')) {
    function trackSalsysDirectUpiCompleted(
        PDO $pdo,
        array $payment,
        array $booking
    ): void {
        $paymentReference = trim((string)($payment['payment_reference'] ?? ''));
        $bookingReference = trim((string)($payment['booking_reference'] ?? ''));

        if ($paymentReference === '' || $bookingReference === '') {
            error_log('Salsys Direct UPI completion skipped: payment/booking reference missing.');
            return;
        }

        if (!function_exists('salsys_track_payment_completed')) {
            error_log(
                'Salsys payment.completed helper unavailable [' .
                $paymentReference .
                ']'
            );
            return;
        }

        $customer = [
            'email' => trim((string)($booking['email'] ?? '')),
            'phone' => trim((string)($booking['phone'] ?? '')),
        ];

        $paymentPlan = strtolower(trim((string)($payment['payment_plan'] ?? '')));
        $paymentKind = in_array($paymentPlan, ['deposit', 'balance', 'full'], true)
            ? $paymentPlan
            : 'other';
        $currency = strtoupper(trim((string)($payment['currency'] ?? $booking['currency'] ?? '')));
        $businessAmount = (float)($payment['subtotal'] ?? 0);

        try {
            $paymentResult = salsys_track_payment_completed(
                $paymentReference,
                $bookingReference,
                $customer,
                [
                    'provider' => 'direct_upi',
                    'payment_kind' => $paymentKind,
                    'amount' => $businessAmount,
                    'currency' => $currency,
                ],
                [
                    'metadata' => [
                        'integration' => 'yogakulam_checkout',
                        'verification_source' => 'admin_upi_proof_verification',
                        'verified_by_admin' => true,
                        'checkout_stage' => 'payment_verified',
                        'gateway_amount' => (float)($payment['amount_payable'] ?? $businessAmount),
                        'remaining_balance' => (float)($payment['remaining_balance'] ?? 0),
                    ],
                ]
            );

            if (!is_array($paymentResult) || empty($paymentResult['ok'])) {
                error_log(
                    'Salsys payment.completed failed [' .
                    $paymentReference .
                    ']: ' .
                    (
                        is_array($paymentResult)
                            ? (string)($paymentResult['error'] ?? 'unknown')
                            : 'invalid helper response'
                    )
                );
            }
        } catch (Throwable $e) {
            error_log(
                'Salsys payment.completed exception [' .
                $paymentReference .
                ']: ' .
                $e->getMessage()
            );
        }

        /*
         * Yogakulam's current commercial rule is that the first verified
         * payment/deposit confirms enrollment. We intentionally emit the same
         * deterministic enrollment identity on every authoritative paid path:
         * retries or later balance-payment callbacks are idempotent in SalsysOS.
         */
        if (!function_exists('salsys_track_enrollment_completed')) {
            error_log(
                'Salsys enrollment.completed helper unavailable [' .
                $bookingReference .
                ']'
            );
            return;
        }

        $offerPrice = (float)($booking['offer_price'] ?? 0);
        $regularPrice = (float)($booking['regular_price'] ?? 0);
        $courseValue = $offerPrice > 0 ? $offerPrice : $regularPrice;

        try {
            $enrollmentResult = salsys_track_enrollment_completed(
                'ENR-' . $bookingReference,
                $bookingReference,
                $customer,
                [
                    'course_code' => trim((string)($booking['course_id'] ?? '')),
                    'course' => trim((string)($booking['course'] ?? '')),
                    'total_value' => $courseValue,
                    'currency' => $currency,
                ],
                [
                    'metadata' => [
                        'integration' => 'yogakulam_checkout',
                        'confirmation_basis' => 'verified_payment',
                        'payment_reference' => $paymentReference,
                        'payment_provider' => 'direct_upi',
                    ],
                ]
            );

            if (!is_array($enrollmentResult) || empty($enrollmentResult['ok'])) {
                error_log(
                    'Salsys enrollment.completed failed [' .
                    $bookingReference .
                    ']: ' .
                    (
                        is_array($enrollmentResult)
                            ? (string)($enrollmentResult['error'] ?? 'unknown')
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
 * Integration point inside Yogakulam /admin/payments.php
 * ------------------------------------------------------
 * Existing code already has $bookingInfoSql, $upiPayment, $paymentReference,
 * $bookingRef and commits the verified Direct UPI payment before sending email.
 * Immediately after $pdo->commit(), reload the latest booking row and invoke:
 *
 *   $salsysBookingStmt = $pdo->prepare("\n *       SELECT *\n *       FROM (\n *           $bookingInfoSql\n *       ) booking_info\n *       WHERE booking_reference = ?\n *       LIMIT 1\n *   ");
 *   $salsysBookingStmt->execute([$bookingRef]);
 *   $salsysBooking = $salsysBookingStmt->fetch(PDO::FETCH_ASSOC) ?: [];
 *
 *   trackSalsysDirectUpiCompleted(
 *       $pdo,
 *       array_merge($upiPayment, [
 *           'payment_reference' => $paymentReference,
 *           'booking_reference' => $bookingRef,
 *           'status' => 'paid',
 *       ]),
 *       $salsysBooking
 *   );
 *
 * The live admin file must also load the private Salsys env + tracking helper
 * before this adapter. Do not put SALSYS_SERVER_SECRET in the public repository.
 */
