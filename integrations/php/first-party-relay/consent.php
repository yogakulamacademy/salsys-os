<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    salsys_json_response(['ok' => false, 'error' => 'Method not allowed'], 405);
}

try {
    $payload = salsys_read_json_body(16384);
    $eventId = salsys_event_id($payload);

    $visitorId = $payload['visitor_id'] ?? $payload['anonymous_visitor_id'] ?? null;
    if (!is_string($visitorId) || trim($visitorId) === '') {
        throw new RuntimeException('visitor_id is required');
    }

    $decisions = $payload['decisions'] ?? null;
    if (!is_array($decisions) || $decisions === []) {
        throw new RuntimeException('decisions object is required');
    }

    $row = salsys_enqueue('consent', $eventId, $payload);
    $delivery = $row['status'] === 'delivered'
        ? ['ok' => true, 'delivered' => true, 'idempotent' => true, 'response' => null]
        : salsys_deliver_outbox_row((int) $row['id']);

    $effective = null;
    if (isset($delivery['response']) && is_array($delivery['response'])) {
        $effective = $delivery['response']['effective_decisions'] ?? null;
    }

    salsys_json_response([
        'ok' => true,
        'accepted' => true,
        'event_id' => $eventId,
        'queued' => true,
        'delivered' => (bool) ($delivery['delivered'] ?? false),
        'effective_decisions' => is_array($effective) ? $effective : $decisions,
        'upstream_status' => $delivery['status'] ?? null,
    ], 202);
} catch (JsonException $e) {
    salsys_json_response(['ok' => false, 'error' => 'Invalid JSON payload'], 400);
} catch (Throwable $e) {
    salsys_json_response([
        'ok' => false,
        'error' => substr($e->getMessage(), 0, 500),
    ], 400);
}
