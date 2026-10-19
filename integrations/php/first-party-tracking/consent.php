<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function consentJson(array $body, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    consentJson(['ok' => false, 'error' => 'Method not allowed.'], 405);
}

$maxBytes = 16384;
$contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength > $maxBytes) {
    consentJson(['ok' => false, 'error' => 'Payload too large.'], 413);
}

$origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
$host = strtolower(preg_replace('/:\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? '')));
if ($origin !== '') {
    $originHost = strtolower((string)(parse_url($origin, PHP_URL_HOST) ?: ''));
    if ($originHost === '' || $originHost !== $host) {
        consentJson(['ok' => false, 'error' => 'Cross-origin consent relay request rejected.'], 403);
    }
}

$raw = file_get_contents('php://input');
if ($raw === false || $raw === '') {
    consentJson(['ok' => false, 'error' => 'Empty request body.'], 400);
}
if (strlen($raw) > $maxBytes) {
    consentJson(['ok' => false, 'error' => 'Payload too large.'], 413);
}

try {
    $payload = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($payload)) {
        throw new InvalidArgumentException('Invalid JSON object.');
    }

    /** @var SalsysTracking $tracker */
    $tracker = require __DIR__ . '/bootstrap.php';
    $capture = $tracker->captureConsent($payload);
    $delivery = $tracker->flush(1);

    consentJson([
        'ok' => true,
        'accepted' => true,
        'event_id' => $capture['event_id'],
        'duplicate' => $capture['duplicate'],
        'queued' => true,
        'delivery' => $delivery,
    ], 202);
} catch (InvalidArgumentException $error) {
    consentJson(['ok' => false, 'error' => $error->getMessage()], 400);
} catch (Throwable $error) {
    error_log('[SalsysTracking] consent relay failed: ' . $error->getMessage());
    consentJson(['ok' => false, 'error' => 'Consent relay unavailable.'], 503);
}
