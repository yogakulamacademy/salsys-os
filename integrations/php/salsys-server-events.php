<?php

declare(strict_types=1);

/**
 * SalsysOS trusted server event helper for PHP backends.
 *
 * SECURITY:
 * - Keep SALSYS_SERVER_SECRET on the server only.
 * - Never expose this file's credentials to browser JavaScript.
 * - Call events only after the website has verified the underlying business action.
 *
 * Recommended environment variables:
 *   SALSYS_SERVER_SOURCE_KEY=src_...
 *   SALSYS_SERVER_SECRET=...
 *
 * Endpoint:
 *   POST https://salsysos.com/api/events/v1
 */

if (!function_exists('salsys_server_event')) {
    function salsys_server_event(
        string $eventName,
        string $eventId,
        array $properties,
        array $options = []
    ): array {
        $endpoint = trim((string)($options['endpoint'] ?? 'https://salsysos.com/api/events/v1'));
        $sourceKey = trim((string)($options['source_key'] ?? getenv('SALSYS_SERVER_SOURCE_KEY') ?: ''));
        $secret = trim((string)($options['secret'] ?? getenv('SALSYS_SERVER_SECRET') ?: ''));

        if ($endpoint === '' || $sourceKey === '' || $secret === '') {
            return [
                'ok' => false,
                'sent' => false,
                'status' => null,
                'error' => 'Salsys server tracking credentials are not configured.',
            ];
        }

        $eventName = trim($eventName);
        $eventId = trim($eventId);

        if ($eventName === '' || $eventId === '') {
            return [
                'ok' => false,
                'sent' => false,
                'status' => null,
                'error' => 'event_name and event_id are required.',
            ];
        }

        $body = [
            'event_id' => $eventId,
            'event_name' => $eventName,
            'schema_version' => 1,
            'occurred_at' => (string)($options['occurred_at'] ?? gmdate('c')),
            'site' => (string)($options['site'] ?? ($_SERVER['HTTP_HOST'] ?? '')),
            'properties' => $properties,
            'metadata' => array_merge(
                [
                    'integration' => 'php_backend',
                    'trusted_business_event' => true,
                ],
                is_array($options['metadata'] ?? null) ? $options['metadata'] : []
            ),
        ];

        $anonymousVisitorId = trim((string)($options['anonymous_visitor_id'] ?? ''));
        if ($anonymousVisitorId !== '') {
            $body['anonymous_visitor_id'] = $anonymousVisitorId;
        }

        $sessionKey = trim((string)($options['session_key'] ?? ''));
        if ($sessionKey !== '') {
            $body['session_key'] = $sessionKey;
        }

        $externalMessageId = trim((string)($options['external_message_id'] ?? ''));
        if ($externalMessageId !== '') {
            $body['external_message_id'] = $externalMessageId;
        }

        $context = $options['context'] ?? null;
        if (is_array($context) && $context !== []) {
            $body['context'] = $context;
        }

        $encoded = json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($encoded === false) {
            return [
                'ok' => false,
                'sent' => false,
                'status' => null,
                'error' => 'Unable to encode Salsys event payload.',
            ];
        }

        $ch = curl_init($endpoint);
        if ($ch === false) {
            return [
                'ok' => false,
                'sent' => false,
                'status' => null,
                'error' => 'Unable to initialize cURL.',
            ];
        }

        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'X-Salsys-Source-Key: ' . $sourceKey,
                'Authorization: Bearer ' . $secret,
            ],
            CURLOPT_POSTFIELDS => $encoded,
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_TIMEOUT => 5,
        ]);

        $responseBody = curl_exec($ch);
        $curlError = curl_error($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($responseBody === false) {
            return [
                'ok' => false,
                'sent' => false,
                'status' => $status ?: null,
                'error' => $curlError !== '' ? $curlError : 'Salsys request failed.',
            ];
        }

        $decoded = json_decode((string)$responseBody, true);
        $accepted = is_array($decoded) && (($decoded['accepted'] ?? false) === true);
        $duplicate = is_array($decoded) && (($decoded['duplicate'] ?? false) === true);

        return [
            'ok' => $status >= 200 && $status < 300 && ($accepted || $duplicate),
            'sent' => true,
            'status' => $status,
            'accepted' => $accepted,
            'duplicate' => $duplicate,
            'response' => is_array($decoded) ? $decoded : null,
            'error' => ($status >= 200 && $status < 300)
                ? null
                : 'Salsys returned HTTP ' . $status,
        ];
    }
}

if (!function_exists('salsys_booking_event')) {
    function salsys_booking_event(
        string $eventName,
        string $bookingReference,
        array $customer,
        array $details = [],
        array $options = []
    ): array {
        $bookingReference = trim($bookingReference);
        $suffix = str_replace('.', '_', strtolower(trim($eventName)));

        return salsys_server_event(
            $eventName,
            $suffix . ':' . $bookingReference,
            array_merge(
                $details,
                [
                    'booking_reference' => $bookingReference,
                    'email' => trim((string)($customer['email'] ?? '')),
                    'phone' => trim((string)($customer['phone'] ?? '')),
                ]
            ),
            $options
        );
    }
}

if (!function_exists('salsys_payment_event')) {
    function salsys_payment_event(
        string $eventName,
        string $paymentReference,
        string $bookingReference,
        array $customer,
        array $payment,
        array $options = []
    ): array {
        $paymentReference = trim($paymentReference);
        $bookingReference = trim($bookingReference);
        $suffix = str_replace('.', '_', strtolower(trim($eventName)));

        return salsys_server_event(
            $eventName,
            $suffix . ':' . $paymentReference,
            [
                'payment_reference' => $paymentReference,
                'booking_reference' => $bookingReference,
                'email' => trim((string)($customer['email'] ?? '')),
                'phone' => trim((string)($customer['phone'] ?? '')),
                'provider' => trim((string)($payment['provider'] ?? $payment['gateway'] ?? '')),
                'payment_kind' => trim((string)($payment['payment_kind'] ?? 'other')),
                'amount' => (float)($payment['amount'] ?? $payment['amount_payable'] ?? 0),
                'currency' => strtoupper(trim((string)($payment['currency'] ?? ''))),
            ],
            $options
        );
    }
}

if (!function_exists('salsys_enrollment_completed')) {
    function salsys_enrollment_completed(
        string $enrollmentReference,
        string $bookingReference,
        array $customer,
        array $enrollment,
        array $options = []
    ): array {
        $enrollmentReference = trim($enrollmentReference);
        $bookingReference = trim($bookingReference);

        $properties = [
            'enrollment_reference' => $enrollmentReference,
            'booking_reference' => $bookingReference,
            'email' => trim((string)($customer['email'] ?? '')),
            'phone' => trim((string)($customer['phone'] ?? '')),
            'course_code' => trim((string)($enrollment['course_code'] ?? '')),
            'course' => trim((string)($enrollment['course'] ?? '')),
            'batch_code' => trim((string)($enrollment['batch_code'] ?? '')),
            'batch' => trim((string)($enrollment['batch'] ?? '')),
            'total_value' => isset($enrollment['total_value']) ? (float)$enrollment['total_value'] : null,
            'currency' => strtoupper(trim((string)($enrollment['currency'] ?? ''))),
        ];

        $properties = array_filter(
            $properties,
            static fn($value) => $value !== null && $value !== ''
        );

        return salsys_server_event(
            'enrollment.completed',
            'enrollment_completed:' . $enrollmentReference,
            $properties,
            $options
        );
    }
}
