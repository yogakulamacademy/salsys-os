<?php
/**
 * SalsysOS - server-side website lead capture helper.
 *
 * Call this only after the website has successfully saved its own enquiry.
 * A SalsysOS outage must never block the website form.
 *
 * Server environment variables:
 *   SALSYSOS_BASE_URL=https://salsysos.com
 *   SALSYSOS_API_SECRET=<tenant integration secret with leads:write scope>
 *
 * Never expose SALSYSOS_API_SECRET in browser JavaScript, HTML or GTM.
 */

function salsysos_capture_lead(array $lead): array
{
    $baseUrl = rtrim((string) (getenv('SALSYSOS_BASE_URL') ?: 'https://salsysos.com'), '/');
    $secret = (string) getenv('SALSYSOS_API_SECRET');

    if ($baseUrl === '' || $secret === '') {
        return ['ok' => false, 'error' => 'SalsysOS server environment variables are not configured'];
    }

    if (empty($lead['externalEventId'])) {
        // Prefer the website enquiry/database ID. This random fallback is suitable only
        // when the helper runs once for a successfully saved submission.
        $lead['externalEventId'] = 'web-' . bin2hex(random_bytes(16));
    }

    $payload = json_encode($lead, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($payload === false) {
        return ['ok' => false, 'error' => 'Unable to encode SalsysOS payload'];
    }

    $ch = curl_init($baseUrl . '/api/leads/capture');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_TIMEOUT => 4,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'X-Salsys-Secret: ' . $secret,
        ],
        CURLOPT_POSTFIELDS => $payload,
    ]);

    $response = curl_exec($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($response === false) {
        return ['ok' => false, 'error' => $curlError ?: 'SalsysOS request failed'];
    }

    $decoded = json_decode($response, true);
    if (!is_array($decoded)) {
        return ['ok' => false, 'status' => $httpCode, 'error' => 'Invalid SalsysOS response'];
    }

    if ($httpCode < 200 || $httpCode >= 300) {
        return [
            'ok' => false,
            'status' => $httpCode,
            'error' => $decoded['error'] ?? 'SalsysOS rejected lead',
        ];
    }

    return $decoded;
}
