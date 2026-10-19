<?php

declare(strict_types=1);

function salsys_config(): array
{
    static $config = null;
    if (is_array($config)) {
        return $config;
    }

    $configPath = __DIR__ . '/config.php';
    if (!is_file($configPath)) {
        throw new RuntimeException('Missing first-party relay config.php');
    }

    $loaded = require $configPath;
    if (!is_array($loaded)) {
        throw new RuntimeException('Relay config.php must return an array');
    }

    foreach (['database_dsn', 'database_user', 'database_password', 'salsys_base_url', 'source_key', 'source_secret'] as $required) {
        if (!isset($loaded[$required]) || trim((string) $loaded[$required]) === '') {
            throw new RuntimeException('Missing relay configuration value: ' . $required);
        }
    }

    $config = $loaded;
    return $config;
}

function salsys_db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $config = salsys_config();
    $pdo = new PDO(
        (string) $config['database_dsn'],
        (string) $config['database_user'],
        (string) $config['database_password'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ],
    );

    return $pdo;
}

function salsys_json_response(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function salsys_read_json_body(int $maxBytes = 32768): array
{
    $length = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
    if ($length > $maxBytes) {
        throw new RuntimeException('Payload too large');
    }

    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        throw new RuntimeException('Empty request body');
    }
    if (strlen($raw) > $maxBytes) {
        throw new RuntimeException('Payload too large');
    }

    $decoded = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($decoded)) {
        throw new RuntimeException('Invalid JSON payload');
    }

    return $decoded;
}

function salsys_event_id(array $payload): string
{
    $value = $payload['event_id'] ?? $payload['eventId'] ?? null;
    if (!is_string($value) || trim($value) === '') {
        throw new RuntimeException('event_id is required');
    }

    return substr(trim($value), 0, 160);
}

function salsys_enqueue(string $kind, string $eventId, array $payload): array
{
    if (!in_array($kind, ['event', 'consent'], true)) {
        throw new RuntimeException('Unsupported outbox event kind');
    }

    $pdo = salsys_db();
    $encoded = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);

    $insert = $pdo->prepare(
        'INSERT INTO tracking_event_outbox
            (event_id, event_kind, payload_json, status, attempts, next_attempt_at)
         VALUES
            (:event_id, :event_kind, :payload_json, \'pending\', 0, NOW(6))
         ON DUPLICATE KEY UPDATE
            updated_at = CURRENT_TIMESTAMP(6)'
    );
    $insert->execute([
        ':event_id' => $eventId,
        ':event_kind' => $kind,
        ':payload_json' => $encoded,
    ]);

    $select = $pdo->prepare(
        'SELECT id, event_id, event_kind, status, attempts, next_attempt_at, delivered_at
         FROM tracking_event_outbox
         WHERE event_kind = :event_kind AND event_id = :event_id
         LIMIT 1'
    );
    $select->execute([
        ':event_kind' => $kind,
        ':event_id' => $eventId,
    ]);

    $row = $select->fetch();
    if (!$row) {
        throw new RuntimeException('Unable to resolve queued tracking event');
    }

    return $row;
}

function salsys_delivery_endpoint(string $kind): string
{
    $base = rtrim((string) salsys_config()['salsys_base_url'], '/');
    return $kind === 'consent'
        ? $base . '/api/privacy/consent/source/v1'
        : $base . '/api/events/v1';
}

function salsys_backoff_seconds(int $attempt): int
{
    if ($attempt < 1) {
        return 0;
    }

    return min(900, 30 * (2 ** min($attempt - 1, 5)));
}

function salsys_http_post(string $url, array $payload): array
{
    $config = salsys_config();
    $body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);

    $ch = curl_init($url);
    if ($ch === false) {
        throw new RuntimeException('Unable to initialize HTTP client');
    }

    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => false,
        CURLOPT_CONNECTTIMEOUT => min(3, (int) ($config['request_timeout_seconds'] ?? 4)),
        CURLOPT_TIMEOUT => (int) ($config['request_timeout_seconds'] ?? 4),
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Accept: application/json',
            'X-Salsys-Source-Key: ' . (string) $config['source_key'],
            'Authorization: Bearer ' . (string) $config['source_secret'],
        ],
        CURLOPT_POSTFIELDS => $body,
    ]);

    $responseBody = curl_exec($ch);
    $curlError = curl_error($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if ($responseBody === false) {
        return [
            'ok' => false,
            'status' => 0,
            'error' => $curlError !== '' ? $curlError : 'Network delivery failed',
            'response' => null,
        ];
    }

    $decoded = null;
    try {
        $decoded = json_decode((string) $responseBody, true, 32, JSON_THROW_ON_ERROR);
    } catch (Throwable $e) {
        $decoded = null;
    }

    return [
        'ok' => $status >= 200 && $status < 300,
        'status' => $status,
        'error' => $status >= 200 && $status < 300
            ? null
            : (is_array($decoded) && isset($decoded['error']) ? (string) $decoded['error'] : 'Upstream HTTP ' . $status),
        'response' => is_array($decoded) ? $decoded : null,
    ];
}

function salsys_deliver_outbox_row(int $id): array
{
    $pdo = salsys_db();
    $config = salsys_config();
    $maxAttempts = max(1, (int) ($config['max_attempts'] ?? 8));

    $pdo->beginTransaction();
    try {
        $select = $pdo->prepare(
            'SELECT * FROM tracking_event_outbox WHERE id = :id FOR UPDATE'
        );
        $select->execute([':id' => $id]);
        $row = $select->fetch();

        if (!$row) {
            $pdo->rollBack();
            return ['ok' => false, 'reason' => 'not_found'];
        }

        if ($row['status'] === 'delivered') {
            $pdo->commit();
            return ['ok' => true, 'delivered' => true, 'idempotent' => true];
        }

        if ($row['status'] === 'dead_letter') {
            $pdo->commit();
            return ['ok' => false, 'dead_letter' => true];
        }

        $attempt = ((int) $row['attempts']) + 1;
        $mark = $pdo->prepare(
            'UPDATE tracking_event_outbox
             SET status = \'delivering\', attempts = :attempts, last_attempt_at = NOW(6), updated_at = NOW(6)
             WHERE id = :id'
        );
        $mark->execute([':attempts' => $attempt, ':id' => $id]);
        $pdo->commit();

        $payload = json_decode((string) $row['payload_json'], true, 32, JSON_THROW_ON_ERROR);
        $result = salsys_http_post(salsys_delivery_endpoint((string) $row['event_kind']), $payload);

        if ($result['ok']) {
            $done = $pdo->prepare(
                'UPDATE tracking_event_outbox
                 SET status = \'delivered\', delivered_at = NOW(6), next_attempt_at = NULL,
                     last_http_status = :status, last_error = NULL, updated_at = NOW(6)
                 WHERE id = :id'
            );
            $done->execute([':status' => $result['status'], ':id' => $id]);

            return [
                'ok' => true,
                'delivered' => true,
                'status' => $result['status'],
                'response' => $result['response'],
            ];
        }

        $dead = $attempt >= $maxAttempts;
        $nextSeconds = salsys_backoff_seconds($attempt);
        $failed = $pdo->prepare(
            'UPDATE tracking_event_outbox
             SET status = :status,
                 next_attempt_at = CASE WHEN :is_dead = 1 THEN NULL ELSE DATE_ADD(NOW(6), INTERVAL :delay SECOND) END,
                 last_http_status = :http_status,
                 last_error = :last_error,
                 updated_at = NOW(6)
             WHERE id = :id'
        );
        $failed->bindValue(':status', $dead ? 'dead_letter' : 'pending');
        $failed->bindValue(':is_dead', $dead ? 1 : 0, PDO::PARAM_INT);
        $failed->bindValue(':delay', $nextSeconds, PDO::PARAM_INT);
        $failed->bindValue(':http_status', (int) $result['status'], PDO::PARAM_INT);
        $failed->bindValue(':last_error', substr((string) ($result['error'] ?? 'Delivery failed'), 0, 1000));
        $failed->bindValue(':id', $id, PDO::PARAM_INT);
        $failed->execute();

        return [
            'ok' => false,
            'delivered' => false,
            'dead_letter' => $dead,
            'status' => $result['status'],
            'error' => $result['error'],
        ];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

function salsys_claim_due_rows(int $limit): array
{
    $pdo = salsys_db();
    $limit = max(1, min(100, $limit));

    $query = $pdo->prepare(
        'SELECT id
         FROM tracking_event_outbox
         WHERE status = \'pending\'
           AND (next_attempt_at IS NULL OR next_attempt_at <= NOW(6))
         ORDER BY id ASC
         LIMIT ' . $limit
    );
    $query->execute();

    return array_map(static fn(array $row): int => (int) $row['id'], $query->fetchAll());
}
