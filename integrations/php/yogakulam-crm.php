<?php
/**
 * LEGACY COMPATIBILITY HELPER - Yogakulam website integration.
 *
 * New integrations should use integrations/php/salsysos-crm.php and the
 * SalsysOS tenant credential contract. This file intentionally preserves the
 * historical function and environment-variable names until the Yogakulam
 * production website has completed its controlled migration.
 *
 * Recommended use: call this AFTER your existing enquiry has been saved successfully
 * in the academy website database. A CRM outage must never block the website form.
 *
 * Legacy server environment variables:
 *   YOGAKULAM_CRM_URL=https://your-crm.vercel.app
 *   YOGAKULAM_CRM_WEBSITE_SECRET=<same value as Vercel WEBSITE_LEAD_CAPTURE_SECRET>
 */

function yogakulam_crm_capture_lead(array $lead): array
{
    $crmUrl = rtrim((string) getenv('YOGAKULAM_CRM_URL'), '/');
    $secret = (string) getenv('YOGAKULAM_CRM_WEBSITE_SECRET');

    if ($crmUrl === '' || $secret === '') {
        return ['ok' => false, 'error' => 'CRM environment variables are not configured'];
    }

    if (empty($lead['externalEventId'])) {
        // Prefer your website enquiry/database ID. This random fallback is suitable only
        // when the handler is executed once for the successful submission.
        $lead['externalEventId'] = 'web-' . bin2hex(random_bytes(16));
    }

    $payload = json_encode($lead, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($payload === false) {
        return ['ok' => false, 'error' => 'Unable to encode CRM payload'];
    }

    $ch = curl_init($crmUrl . '/api/leads/capture');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_TIMEOUT => 4,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'X-Website-Secret: ' . $secret,
        ],
        CURLOPT_POSTFIELDS => $payload,
    ]);

    $response = curl_exec($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($response === false) {
        return ['ok' => false, 'error' => $curlError ?: 'CRM request failed'];
    }

    $decoded = json_decode($response, true);
    if (!is_array($decoded)) {
        return ['ok' => false, 'status' => $httpCode, 'error' => 'Invalid CRM response'];
    }

    if ($httpCode < 200 || $httpCode >= 300) {
        return ['ok' => false, 'status' => $httpCode, 'error' => $decoded['error'] ?? 'CRM rejected lead'];
    }

    return $decoded;
}
