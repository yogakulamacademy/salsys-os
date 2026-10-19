<?php
require_once dirname(__DIR__) . '/event-intelligence.php';

function salsys_worker_authorized()
{
    if (PHP_SAPI === 'cli') {
        return true;
    }

    $config = salsys_event_config();
    $expected = isset($config['worker_token']) ? (string) $config['worker_token'] : '';
    if ($expected === '') {
        return false;
    }

    $provided = isset($_SERVER['HTTP_X_SALSYS_WORKER_TOKEN'])
        ? (string) $_SERVER['HTTP_X_SALSYS_WORKER_TOKEN']
        : '';

    return $provided !== '' && hash_equals($expected, $provided);
}

try {
    if (!salsys_worker_authorized()) {
        salsys_event_json_response(array('ok' => false, 'error' => 'Unauthorized.'), 401);
        exit;
    }

    $config = salsys_event_config();
    $limit = isset($config['batch_size']) ? (int) $config['batch_size'] : 50;

    if (PHP_SAPI === 'cli' && isset($argv[1]) && ctype_digit((string) $argv[1])) {
        $limit = max(1, min((int) $argv[1], 200));
    }

    $summary = salsys_event_run_worker('salsys', $limit);
    $cleaned = 0;
    if (PHP_SAPI === 'cli' && in_array('--cleanup', $argv, true)) {
        $cleaned = (int) salsys_event_cleanup();
    }

    salsys_event_json_response(array(
        'ok' => $summary['failed'] === 0,
        'destination' => 'salsys',
        'claimed' => $summary['claimed'],
        'delivered' => $summary['delivered'],
        'failed' => $summary['failed'],
        'cleaned' => $cleaned,
    ), $summary['failed'] === 0 ? 200 : 207);
} catch (Throwable $error) {
    salsys_event_json_response(array(
        'ok' => false,
        'error' => substr($error->getMessage(), 0, 500),
    ), 500);
}
