<?php

declare(strict_types=1);

/**
 * Retry worker for the first-party tracking outbox.
 *
 * CLI:
 *   php worker.php 50
 *
 * Cron example:
 *   * * * * * /usr/bin/php /home/.../api/tracking/worker.php 50 >/dev/null 2>&1
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$limit = isset($argv[1]) ? (int)$argv[1] : 50;
$limit = max(1, min(100, $limit));

try {
    /** @var SalsysTracking $tracker */
    $tracker = require __DIR__ . '/bootstrap.php';
    $result = $tracker->flush($limit);
    fwrite(STDOUT, json_encode(['ok' => true, 'result' => $result], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    exit(0);
} catch (Throwable $error) {
    error_log('[SalsysTracking] worker failed: ' . $error->getMessage());
    fwrite(STDERR, json_encode(['ok' => false, 'error' => 'Tracking worker failed.']) . PHP_EOL);
    exit(1);
}
