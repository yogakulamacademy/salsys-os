<?php
require_once dirname(__DIR__) . '/event-intelligence.php';

try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        salsys_event_json_response(array('ok' => false, 'error' => 'Method not allowed.'), 405);
        exit;
    }

    salsys_event_assert_same_site_request();
    $payload = salsys_event_read_json_request();
    $result = salsys_event_emit_browser($payload);

    salsys_event_json_response(array(
        'ok' => true,
        'accepted' => true,
        'event_id' => $result['event_id'],
        'duplicate' => $result['duplicate'],
        'journaled' => true,
        'upstream_delivery' => $result['delivery'],
    ), 202);
} catch (Throwable $error) {
    $message = $error->getMessage();
    $status = strpos($message, 'origin') !== false || strpos($message, 'host') !== false ? 403 : 400;
    salsys_event_json_response(array('ok' => false, 'accepted' => false, 'error' => $message), $status);
}
