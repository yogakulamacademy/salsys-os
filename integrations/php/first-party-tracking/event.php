<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function trackingJson(array $body, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    trackingJson(['ok' => false, 'error' => 'Method not allowed.'], 405);
}

$maxBytes = 65536;
$contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength > $maxBytes) {
    trackingJson(['ok' => false, 'error' => 'Payload too large.'], 413);
}

// This public endpoint is intentionally first-party only. Server/business events
// should call SalsysTracking::captureServerEvent() from trusted backend code.
$origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
$host = strtolower(preg_replace('/:\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? '')));
if ($origin !== '') {
    $originHost = strtolower((string)(parse_url($origin, PHP_URL_HOST) ?: ''));
    if ($originHost === '' || $originHost !== $host) {
        trackingJson(['ok' => false, 'error' => 'Cross-origin tracking relay request rejected.'], 403);
    }
}

// Browser analytics are accepted only after explicit analytics consent. The
// Salsys SDK maintains both names during the Yogakulam migration window.
$analyticsConsent = ($_COOKIE['salsys_analytics_consent'] ?? null) === '1'
    || ($_COOKIE['yk_analytics_consent'] ?? null) === '1';
if (!$analyticsConsent) {
    trackingJson([
        'ok' => true,
        'accepted' => false,
        'privacy_blocked' => true,
        'reason' => 'analytics_consent_required',
    ], 200);
}

$raw = file_get_contents('php://input');
if ($raw === false || $raw === '') {
    trackingJson(['ok' => false, 'error' => 'Empty request body.'], 400);
}
if (strlen($raw) > $maxBytes) {
    trackingJson(['ok' => false, 'error' => 'Payload too large.'], 413);
}

try {
    $payload = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($payload)) {
        throw new InvalidArgumentException('Invalid JSON object.');
    }

    /** @var SalsysTracking $tracker */
    $tracker = require __DIR__ . '/bootstrap.php';
    $capture = $tracker->captureBrowserEvent($payload);

    // Local persistence is the durability boundary. Upstream SalsysOS delivery
    // is best-effort here and is retried by worker.php if it cannot complete.
    $delivery = $tracker->flush(1);

    trackingJson([
        'ok' => true,
        'accepted' => true,
        'event_id' => $capture['event_id'],
        'duplicate' => $capture['duplicate'],
        'queued' => true,
        'delivery' => $delivery,
    ], 202);
} catch (InvalidArgumentException $error) {
    trackingJson(['ok' => false, 'error' => $error->getMessage()], 400);
} catch (Throwable $error) {
    error_log('[SalsysTracking] event relay failed: ' . $error->getMessage());
    trackingJson(['ok' => false, 'error' => 'Tracking relay unavailable.'], 503);
}
