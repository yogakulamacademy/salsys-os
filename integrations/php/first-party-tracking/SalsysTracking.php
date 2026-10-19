<?php

declare(strict_types=1);

final class SalsysTracking
{
    private PDO $pdo;
    private array $config;

    public function __construct(PDO $pdo, array $config)
    {
        $this->pdo = $pdo;
        $this->config = $config;
        $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    }

    public static function randomId(string $prefix = 'evt'): string
    {
        return $prefix . '_' . bin2hex(random_bytes(16));
    }

    public function captureBrowserEvent(array $payload): array
    {
        $eventId = $this->requiredText($payload['event_id'] ?? $payload['eventId'] ?? null, 180, 'event_id');
        $eventName = strtolower($this->requiredText($payload['event_name'] ?? $payload['eventName'] ?? null, 160, 'event_name'));

        if (!preg_match('/^web\.[a-z][a-z0-9_]*$/', $eventName)) {
            throw new InvalidArgumentException('The browser relay accepts web.* events only.');
        }

        $payload['event_id'] = $eventId;
        $payload['event_name'] = $eventName;
        $payload['schema_version'] = max(1, (int)($payload['schema_version'] ?? $payload['schemaVersion'] ?? 1));
        $payload['site'] = $this->text($payload['site'] ?? null, 240) ?: (string)$this->config['site'];

        return $this->persist('event', $eventId, $eventName, $payload['occurred_at'] ?? $payload['occurredAt'] ?? null, $payload);
    }

    public function captureConsent(array $payload): array
    {
        $eventId = $this->requiredText($payload['eventId'] ?? $payload['event_id'] ?? null, 180, 'eventId');
        $consent = $payload['consent'] ?? null;
        if (!is_array($consent)) {
            throw new InvalidArgumentException('consent is required.');
        }

        $hasExplicitState = false;
        foreach (['analytics', 'adUserData', 'adPersonalization', 'marketing'] as $key) {
            if (array_key_exists($key, $consent) && is_bool($consent[$key])) {
                $hasExplicitState = true;
            }
        }
        if (!$hasExplicitState) {
            throw new InvalidArgumentException('At least one explicit consent state is required.');
        }

        $payload['eventId'] = $eventId;
        $payload['site'] = $this->text($payload['site'] ?? null, 240) ?: (string)$this->config['site'];

        return $this->persist('consent', $eventId, 'privacy.consent_updated', $payload['occurredAt'] ?? $payload['occurred_at'] ?? null, $payload);
    }

    /**
     * Emit authoritative website-backend business events such as booking.started,
     * payment.completed or enrollment.completed. Use a deterministic event_id
     * for provider/payment callbacks so retries remain idempotent.
     */
    public function captureServerEvent(string $eventName, array $properties = [], array $options = []): array
    {
        $eventName = strtolower(trim($eventName));
        if (!preg_match('/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/', $eventName)) {
            throw new InvalidArgumentException('Invalid event name.');
        }

        $eventId = $this->text($options['event_id'] ?? null, 180) ?: self::randomId('evt');
        $occurredAt = $this->text($options['occurred_at'] ?? null, 80) ?: gmdate('c');
        $visitorId = $this->text($options['anonymous_visitor_id'] ?? null, 180);
        $sessionKey = $this->text($options['session_key'] ?? null, 180);
        $externalMessageId = $this->text($options['external_message_id'] ?? null, 240);

        $envelope = [
            'event_id' => $eventId,
            'event_name' => $eventName,
            'schema_version' => max(1, (int)($options['schema_version'] ?? 1)),
            'occurred_at' => $occurredAt,
            'anonymous_visitor_id' => $visitorId,
            'session_key' => $sessionKey,
            'external_message_id' => $externalMessageId,
            'site' => $this->text($options['site'] ?? null, 240) ?: (string)$this->config['site'],
            'properties' => $properties,
            'context' => is_array($options['context'] ?? null) ? $options['context'] : [],
            'metadata' => array_merge(
                ['adapter' => 'first_party_php_relay', 'authoritative_server_event' => true],
                is_array($options['metadata'] ?? null) ? $options['metadata'] : []
            ),
        ];

        return $this->persist('event', $eventId, $eventName, $occurredAt, $envelope);
    }

    private function persist(string $kind, string $eventId, ?string $eventName, mixed $occurredAt, array $payload): array
    {
        $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $occurredSql = $this->mysqlDateTime($occurredAt);

        $this->pdo->beginTransaction();
        try {
            $insert = $this->pdo->prepare(
                'INSERT IGNORE INTO site_tracking_events (event_id,event_kind,event_name,occurred_at,payload_json) VALUES (?,?,?,?,?)'
            );
            $insert->execute([$eventId, $kind, $eventName, $occurredSql, $json]);

            $select = $this->pdo->prepare('SELECT id,event_id,event_kind,event_name,created_at FROM site_tracking_events WHERE event_id=? LIMIT 1');
            $select->execute([$eventId]);
            $event = $select->fetch();
            if (!$event) {
                throw new RuntimeException('Unable to persist tracking event.');
            }

            $delivery = $this->pdo->prepare(
                "INSERT IGNORE INTO site_tracking_deliveries (tracking_event_id,destination,status,next_attempt_at) VALUES (?,'salsys','pending',CURRENT_TIMESTAMP(6))"
            );
            $delivery->execute([(int)$event['id']]);
            $this->pdo->commit();

            return [
                'ok' => true,
                'accepted' => true,
                'event_id' => $eventId,
                'local_event_id' => (int)$event['id'],
                'duplicate' => $insert->rowCount() === 0,
                'queued' => true,
            ];
        } catch (Throwable $error) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $error;
        }
    }

    public function flush(int $limit = 20): array
    {
        $limit = max(1, min(100, $limit));
        $select = $this->pdo->prepare(
            "SELECT d.id AS delivery_id,d.attempts,e.event_kind,e.event_id,e.payload_json
             FROM site_tracking_deliveries d
             JOIN site_tracking_events e ON e.id=d.tracking_event_id
             WHERE d.destination='salsys'
               AND d.status IN ('pending','processing')
               AND (d.next_attempt_at IS NULL OR d.next_attempt_at<=CURRENT_TIMESTAMP(6))
             ORDER BY d.id ASC
             LIMIT {$limit}"
        );
        $select->execute();
        $rows = $select->fetchAll();

        $result = ['claimed' => 0, 'delivered' => 0, 'retried' => 0, 'failed' => 0];
        foreach ($rows as $row) {
            if (!$this->claimDelivery((int)$row['delivery_id'])) {
                continue;
            }
            $result['claimed']++;

            try {
                $payload = json_decode((string)$row['payload_json'], true, 512, JSON_THROW_ON_ERROR);
                $response = $this->deliver((string)$row['event_kind'], $payload);
                if ($response['ok']) {
                    $this->markDelivered((int)$row['delivery_id'], (int)$response['status'], (string)$response['body']);
                    $result['delivered']++;
                } else {
                    $terminal = ((int)$row['attempts'] + 1) >= (int)$this->config['delivery_max_attempts'];
                    $this->markRetry((int)$row['delivery_id'], (int)$row['attempts'] + 1, (int)$response['status'], (string)$response['error'], (string)$response['body'], $terminal);
                    $result[$terminal ? 'failed' : 'retried']++;
                }
            } catch (Throwable $error) {
                $terminal = ((int)$row['attempts'] + 1) >= (int)$this->config['delivery_max_attempts'];
                $this->markRetry((int)$row['delivery_id'], (int)$row['attempts'] + 1, 0, $error->getMessage(), '', $terminal);
                $result[$terminal ? 'failed' : 'retried']++;
            }
        }

        return $result;
    }

    private function claimDelivery(int $deliveryId): bool
    {
        $claim = $this->pdo->prepare(
            "UPDATE site_tracking_deliveries
             SET status='processing',claimed_at=CURRENT_TIMESTAMP(6),updated_at=CURRENT_TIMESTAMP(6)
             WHERE id=? AND status IN ('pending','processing')"
        );
        $claim->execute([$deliveryId]);
        return $claim->rowCount() === 1;
    }

    private function deliver(string $kind, array $payload): array
    {
        $base = rtrim((string)$this->config['salsys_base_url'], '/');
        if ($kind === 'consent') {
            return $this->postJson(
                $base . '/api/tracking/consent',
                $payload,
                ['Origin: ' . (string)$this->config['site_origin']]
            );
        }

        $sourceKey = trim((string)$this->config['salsys_source_key']);
        $secret = trim((string)$this->config['salsys_source_secret']);
        if ($sourceKey === '' || $secret === '') {
            throw new RuntimeException('Salsys server tracking source credentials are not configured.');
        }

        return $this->postJson(
            $base . '/api/events/v1',
            $payload,
            [
                'X-Salsys-Source-Key: ' . $sourceKey,
                'Authorization: Bearer ' . $secret,
            ]
        );
    }

    private function postJson(string $url, array $payload, array $extraHeaders = []): array
    {
        if (!function_exists('curl_init')) {
            throw new RuntimeException('PHP cURL extension is required for tracking delivery.');
        }

        $body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => (int)$this->config['delivery_connect_timeout_seconds'],
            CURLOPT_TIMEOUT => (int)$this->config['delivery_timeout_seconds'],
            CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/json', 'Accept: application/json'], $extraHeaders),
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HEADER => false,
        ]);

        $responseBody = curl_exec($ch);
        $curlError = curl_error($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        if ($responseBody === false) {
            return ['ok' => false, 'status' => 0, 'body' => '', 'error' => $curlError ?: 'Network delivery failed.'];
        }

        $ok = $status >= 200 && $status < 300;
        return [
            'ok' => $ok,
            'status' => $status,
            'body' => substr((string)$responseBody, 0, 2000),
            'error' => $ok ? '' : ('HTTP ' . $status),
        ];
    }

    private function markDelivered(int $deliveryId, int $status, string $body): void
    {
        $stmt = $this->pdo->prepare(
            "UPDATE site_tracking_deliveries
             SET status='delivered',attempts=attempts+1,delivered_at=CURRENT_TIMESTAMP(6),next_attempt_at=NULL,last_http_status=?,last_error=NULL,response_excerpt=?,updated_at=CURRENT_TIMESTAMP(6)
             WHERE id=?"
        );
        $stmt->execute([$status, substr($body, 0, 2000), $deliveryId]);
    }

    private function markRetry(int $deliveryId, int $attempt, int $status, string $error, string $body, bool $terminal): void
    {
        $delaySeconds = min(3600, 15 * (2 ** max(0, min(8, $attempt - 1))));
        $next = $terminal ? null : gmdate('Y-m-d H:i:s.u', time() + $delaySeconds);
        $stmt = $this->pdo->prepare(
            "UPDATE site_tracking_deliveries
             SET status=?,attempts=?,next_attempt_at=?,last_http_status=?,last_error=?,response_excerpt=?,updated_at=CURRENT_TIMESTAMP(6)
             WHERE id=?"
        );
        $stmt->execute([
            $terminal ? 'failed' : 'pending',
            $attempt,
            $next,
            $status > 0 ? $status : null,
            substr($error, 0, 1000),
            substr($body, 0, 2000),
            $deliveryId,
        ]);
    }

    private function text(mixed $value, int $max): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $value = trim($value);
        return $value === '' ? null : mb_substr($value, 0, $max);
    }

    private function requiredText(mixed $value, int $max, string $name): string
    {
        $text = $this->text($value, $max);
        if ($text === null) {
            throw new InvalidArgumentException($name . ' is required.');
        }
        return $text;
    }

    private function mysqlDateTime(mixed $value): ?string
    {
        if (!is_string($value) || trim($value) === '') {
            return null;
        }
        try {
            $date = new DateTimeImmutable($value);
            return $date->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.u');
        } catch (Throwable) {
            return null;
        }
    }
}
