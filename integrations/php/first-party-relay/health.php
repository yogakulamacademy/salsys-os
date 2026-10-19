<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

try {
    $config = salsys_config();
    $configuredSecret = (string) ($config['worker_secret'] ?? '');
    $providedSecret = (string) ($_SERVER['HTTP_X_SALSYS_WORKER_SECRET'] ?? '');

    if ($configuredSecret === '' || $providedSecret === '' || !hash_equals($configuredSecret, $providedSecret)) {
        salsys_json_response(['ok' => false, 'error' => 'Unauthorized'], 401);
    }

    $pdo = salsys_db();
    $summary = $pdo->query(
        "SELECT
            COUNT(*) AS total,
            SUM(status = 'pending') AS pending,
            SUM(status = 'delivering') AS delivering,
            SUM(status = 'delivered') AS delivered,
            SUM(status = 'dead_letter') AS dead_letter,
            MIN(CASE WHEN status = 'pending' THEN created_at END) AS oldest_pending_at,
            MAX(delivered_at) AS last_delivered_at
         FROM tracking_event_outbox"
    )->fetch();

    $recent = $pdo->query(
        "SELECT id, event_id, event_kind, status, attempts, last_http_status,
                last_error, created_at, next_attempt_at, delivered_at
         FROM tracking_event_outbox
         ORDER BY id DESC
         LIMIT 20"
    )->fetchAll();

    salsys_json_response([
        'ok' => true,
        'summary' => $summary ?: [],
        'recent' => $recent,
        'checked_at' => gmdate('c'),
    ]);
} catch (Throwable $e) {
    salsys_json_response([
        'ok' => false,
        'error' => substr($e->getMessage(), 0, 500),
    ], 500);
}
