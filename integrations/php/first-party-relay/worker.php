<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

try {
    $config = salsys_config();
    $limit = max(1, min(100, (int) ($config['worker_batch_size'] ?? 25)));
    $ids = salsys_claim_due_rows($limit);

    $summary = [
        'ok' => true,
        'claimed' => count($ids),
        'delivered' => 0,
        'failed' => 0,
        'dead_letter' => 0,
        'items' => [],
    ];

    foreach ($ids as $id) {
        try {
            $result = salsys_deliver_outbox_row($id);
            if (!empty($result['delivered'])) {
                $summary['delivered']++;
            } elseif (!empty($result['dead_letter'])) {
                $summary['dead_letter']++;
            } else {
                $summary['failed']++;
            }
            $summary['items'][] = [
                'id' => $id,
                'delivered' => (bool) ($result['delivered'] ?? false),
                'dead_letter' => (bool) ($result['dead_letter'] ?? false),
                'status' => $result['status'] ?? null,
            ];
        } catch (Throwable $e) {
            $summary['failed']++;
            $summary['items'][] = [
                'id' => $id,
                'delivered' => false,
                'dead_letter' => false,
                'error' => substr($e->getMessage(), 0, 300),
            ];
        }
    }

    if (PHP_SAPI === 'cli') {
        echo json_encode($summary, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL;
        exit($summary['failed'] > 0 ? 1 : 0);
    }

    $configuredSecret = (string) ($config['worker_secret'] ?? '');
    $providedSecret = (string) ($_SERVER['HTTP_X_SALSYS_WORKER_SECRET'] ?? '');
    if ($configuredSecret === '' || $providedSecret === '' || !hash_equals($configuredSecret, $providedSecret)) {
        salsys_json_response(['ok' => false, 'error' => 'Unauthorized'], 401);
    }

    salsys_json_response($summary, 200);
} catch (Throwable $e) {
    $payload = [
        'ok' => false,
        'error' => substr($e->getMessage(), 0, 500),
    ];

    if (PHP_SAPI === 'cli') {
        fwrite(STDERR, json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL);
        exit(1);
    }

    salsys_json_response($payload, 500);
}
