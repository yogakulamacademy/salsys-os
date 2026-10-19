<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    salsys_json_response(['ok' => false, 'error' => 'Method not allowed'], 405);
}

try {
    $payload = salsys_read_json_body(32768);
    $eventId = salsys_event_id($payload);

    $eventName = $payload['event_name'] ?? $payload['eventName'] ?? null;
    if (!is_string($eventName) || !preg_match('/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/', strtolower(trim($eventName)))) {
        throw new RuntimeException('Valid canonical event_name is required');
    }

    $row = salsys_enqueue('event', $eventId, $payload);
    $delivery = $row['status'] === 'delivered'
        ? ['ok' => true, 'delivered' => true, 'idempotent' => true]
        : salsys_deliver_outbox_row((int) $row['id']);

    salsys_json_response([
        'ok' => true,
        'accepted' => true,
        'event_id' => $eventId,
        'queued' => true,
        'delivered' => (bool) ($delivery['delivered'] ?? false),
        'upstream_status' => $delivery['status'] ?? null,
        'upstream' => $delivery['response'] ?? null,
    ], 202);
} catch (JsonException $e) {
    salsys_json_response(['ok' => false, 'error' => 'Invalid JSON payload'], 400);
} catch (Throwable $e) {
    salsys_json_response([
        'ok' => false,
        'error' => substr($e->getMessage(), 0, 500),
    ], 400);
}
