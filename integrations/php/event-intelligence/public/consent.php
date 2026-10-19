<?php
require_once dirname(__DIR__) . '/event-intelligence.php';

try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        salsys_event_json_response(array('ok' => false, 'error' => 'Method not allowed.'), 405);
        exit;
    }

    salsys_event_assert_same_site_request();
    $payload = salsys_event_read_json_request(16384);
    $result = salsys_event_emit_consent($payload);

    // The privacy choice is journaled before any upstream call. Return the
    // effective submitted state immediately so the browser can enforce it even
    // if an adapter is temporarily unavailable.
    salsys_event_json_response(array(
        'ok' => true,
        'accepted' => true,
        'event_id' => $result['event_id'],
        'duplicate' => $result['duplicate'],
        'journaled' => true,
        'effective_decisions' => isset($payload['decisions']) && is_array($payload['decisions'])
            ? $payload['decisions']
            : array(),
        'upstream_delivery' => $result['delivery'],
    ), 202);
} catch (Throwable $error) {
    $message = $error->getMessage();
    $status = strpos($message, 'origin') !== false || strpos($message, 'host') !== false ? 403 : 400;
    salsys_event_json_response(array('ok' => false, 'accepted' => false, 'error' => $message), $status);
}
