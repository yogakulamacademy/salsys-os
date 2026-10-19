<?php
/**
 * Salsys Event Intelligence - destination-neutral PHP relay/runtime.
 *
 * Requirements: PHP 7.4+, PDO MySQL, cURL.
 * Secrets remain server-side. Browser endpoints write the local event journal
 * first, then delivery adapters forward the same immutable event to downstream
 * systems. SalsysOS is the first adapter, not the owner of the browser contract.
 */

if (defined('SALSYS_EVENT_INTELLIGENCE_LOADED')) {
    return;
}
define('SALSYS_EVENT_INTELLIGENCE_LOADED', true);

$GLOBALS['salsys_event_pdo_override'] = null;
$GLOBALS['salsys_event_config_override'] = null;

function salsys_event_set_pdo(PDO $pdo)
{
    $GLOBALS['salsys_event_pdo_override'] = $pdo;
}

function salsys_event_set_config(array $config)
{
    $GLOBALS['salsys_event_config_override'] = $config;
}

function salsys_event_config()
{
    if (is_array($GLOBALS['salsys_event_config_override'])) {
        return $GLOBALS['salsys_event_config_override'];
    }

    static $config = null;
    if (is_array($config)) {
        return $config;
    }

    $path = getenv('SALSYS_TRACKING_CONFIG');
    if (!$path) {
        $path = __DIR__ . '/config.php';
    }

    if (!is_file($path)) {
        throw new RuntimeException(
            'Event Intelligence config not found. Copy config.example.php to a private config.php or set SALSYS_TRACKING_CONFIG.'
        );
    }

    $loaded = require $path;
    if (!is_array($loaded)) {
        throw new RuntimeException('Event Intelligence config must return an array.');
    }

    $config = $loaded;
    return $config;
}

function salsys_event_pdo()
{
    if ($GLOBALS['salsys_event_pdo_override'] instanceof PDO) {
        return $GLOBALS['salsys_event_pdo_override'];
    }

    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $config = salsys_event_config();
    $db = isset($config['database']) && is_array($config['database'])
        ? $config['database']
        : array();

    $dsn = isset($db['dsn']) ? trim((string) $db['dsn']) : '';
    if ($dsn === '') {
        throw new RuntimeException('SALSYS tracking database DSN is not configured.');
    }

    $pdo = new PDO(
        $dsn,
        isset($db['user']) ? (string) $db['user'] : '',
        isset($db['password']) ? (string) $db['password'] : '',
        array(
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        )
    );

    return $pdo;
}

function salsys_event_now()
{
    return gmdate('Y-m-d H:i:s.u');
}

function salsys_event_uuid($prefix)
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);
    $uuid = substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' .
        substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
    return $prefix . '_' . $uuid;
}

function salsys_event_json_encode($value)
{
    $json = json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        throw new RuntimeException('Unable to encode event payload.');
    }
    return $json;
}

function salsys_event_read_json_request($maxBytes = null)
{
    if ($maxBytes === null) {
        $config = salsys_event_config();
        $maxBytes = isset($config['max_request_bytes']) ? (int) $config['max_request_bytes'] : 65536;
    }

    $length = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
    if ($length > $maxBytes) {
        throw new RuntimeException('Payload too large.');
    }

    $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
    if ($raw === false || strlen($raw) > $maxBytes) {
        throw new RuntimeException('Payload too large.');
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Invalid JSON payload.');
    }

    return $decoded;
}

function salsys_event_origin_host($origin)
{
    if (!is_string($origin) || trim($origin) === '') {
        return null;
    }
    $parts = parse_url(trim($origin));
    if (!is_array($parts) || empty($parts['host'])) {
        return null;
    }
    return strtolower(rtrim((string) $parts['host'], '.'));
}

function salsys_event_assert_same_site_request()
{
    $config = salsys_event_config();
    $siteOrigin = isset($config['site_origin']) ? (string) $config['site_origin'] : '';
    $expectedHost = salsys_event_origin_host($siteOrigin);
    if (!$expectedHost) {
        throw new RuntimeException('site_origin is not configured.');
    }

    $origin = isset($_SERVER['HTTP_ORIGIN']) ? (string) $_SERVER['HTTP_ORIGIN'] : '';
    if ($origin !== '') {
        $originHost = salsys_event_origin_host($origin);
        if ($originHost !== $expectedHost) {
            throw new RuntimeException('Request origin is not allowed.');
        }
        return;
    }

    $host = isset($_SERVER['HTTP_HOST']) ? strtolower(preg_replace('/:\\d+$/', '', (string) $_SERVER['HTTP_HOST'])) : '';
    if ($host !== '' && $host !== $expectedHost) {
        throw new RuntimeException('Request host is not allowed.');
    }
}

function salsys_event_clean_text($value, $max)
{
    if (!is_string($value)) {
        return null;
    }
    $value = trim($value);
    return $value === '' ? null : substr($value, 0, $max);
}

function salsys_event_is_sensitive_browser_key($key)
{
    $key = strtolower(str_replace('-', '_', (string) $key));
    static $forbidden = array(
        'password' => true,
        'passwd' => true,
        'authorization' => true,
        'cookie' => true,
        'set_cookie' => true,
        'secret' => true,
        'token' => true,
        'access_token' => true,
        'refresh_token' => true,
        'api_key' => true,
        'apikey' => true,
        'private_key' => true,
        'email' => true,
        'email_address' => true,
        'phone' => true,
        'phone_number' => true,
        'mobile' => true,
        'mobile_number' => true,
        'first_name' => true,
        'last_name' => true,
        'full_name' => true,
        'address' => true,
        'street_address' => true,
        'date_of_birth' => true,
        'dob' => true,
        'card_number' => true,
        'cvv' => true,
        'cvc' => true,
    );
    return isset($forbidden[$key]);
}

function salsys_event_sanitize_browser_value($value, $depth = 0)
{
    if ($depth > 7) {
        return '[max_depth]';
    }
    if ($value === null || is_bool($value) || is_int($value) || is_float($value)) {
        return $value;
    }
    if (is_string($value)) {
        return substr($value, 0, 4000);
    }
    if (!is_array($value)) {
        return null;
    }

    $result = array();
    $count = 0;
    foreach ($value as $key => $item) {
        if ($count >= 150) {
            break;
        }
        if (is_string($key) && salsys_event_is_sensitive_browser_key($key)) {
            continue;
        }
        $safeKey = is_string($key) ? substr($key, 0, 120) : $key;
        $result[$safeKey] = salsys_event_sanitize_browser_value($item, $depth + 1);
        $count++;
    }
    return $result;
}

function salsys_event_browser_analytics_granted(array $event)
{
    $metadata = isset($event['metadata']) && is_array($event['metadata']) ? $event['metadata'] : array();
    $snapshot = isset($metadata['consent_snapshot']) && is_array($metadata['consent_snapshot'])
        ? $metadata['consent_snapshot']
        : array();
    return isset($snapshot['analytics']) && $snapshot['analytics'] === 'granted';
}

function salsys_event_validate_browser_event(array $input)
{
    $eventId = salsys_event_clean_text(
        isset($input['event_id']) ? $input['event_id'] : (isset($input['eventId']) ? $input['eventId'] : null),
        190
    );
    $eventName = strtolower((string) salsys_event_clean_text(
        isset($input['event_name']) ? $input['event_name'] : (isset($input['eventName']) ? $input['eventName'] : null),
        120
    ));

    if (!$eventId || !$eventName) {
        throw new RuntimeException('event_id and event_name are required.');
    }
    if (!preg_match('/^web\\.[a-z][a-z0-9_]{0,79}$/', $eventName)) {
        throw new RuntimeException('Browser relay only accepts web.* events.');
    }

    $event = salsys_event_sanitize_browser_value($input);
    $event['event_id'] = $eventId;
    $event['event_name'] = $eventName;
    $event['schema_version'] = isset($input['schema_version']) ? max(1, min(100, (int) $input['schema_version'])) : 1;

    // A form submission may be a service-delivery event before analytics consent.
    // In that case keep only the routing/form context required to join the lead;
    // do not forward analytics attribution, referrer, title, viewport, or ad IDs.
    if ($eventName === 'web.form_submitted' && !salsys_event_browser_analytics_granted($event)) {
        $properties = isset($event['properties']) && is_array($event['properties']) ? $event['properties'] : array();
        $minimal = array();
        foreach (array('form_id', 'form_action', 'pagePath') as $key) {
            if (isset($properties[$key])) {
                $minimal[$key] = $properties[$key];
            }
        }
        $event['properties'] = $minimal;
        $context = isset($event['context']) && is_array($event['context']) ? $event['context'] : array();
        $event['context'] = array(
            'gpc' => isset($context['gpc']) ? (bool) $context['gpc'] : false,
            'page_path' => isset($context['page_path']) ? substr((string) $context['page_path'], 0, 1000) : null,
        );
    }

    return $event;
}

function salsys_event_parse_occurred_at(array $payload)
{
    $value = isset($payload['occurred_at']) ? $payload['occurred_at'] : (isset($payload['occurredAt']) ? $payload['occurredAt'] : null);
    if (!is_string($value) || trim($value) === '') {
        return null;
    }
    $timestamp = strtotime($value);
    if ($timestamp === false) {
        return null;
    }
    return gmdate('Y-m-d H:i:s', $timestamp);
}

function salsys_event_destination_enabled($destination)
{
    $config = salsys_event_config();
    return isset($config['destinations'][$destination]) &&
        is_array($config['destinations'][$destination]) &&
        !empty($config['destinations'][$destination]['enabled']);
}

function salsys_event_store(array $payload, $kind, $eventName = null, array $destinations = array('salsys'))
{
    $pdo = salsys_event_pdo();
    $eventId = salsys_event_clean_text(
        isset($payload['event_id']) ? $payload['event_id'] : (isset($payload['eventId']) ? $payload['eventId'] : null),
        190
    );
    if (!$eventId) {
        throw new RuntimeException('event_id is required.');
    }

    $kind = substr((string) $kind, 0, 32);
    $eventName = $eventName ? substr((string) $eventName, 0, 120) : null;
    $schemaVersion = isset($payload['schema_version']) ? max(1, (int) $payload['schema_version']) : 1;
    $json = salsys_event_json_encode($payload);
    $hash = hash('sha256', $json);
    $occurredAt = salsys_event_parse_occurred_at($payload);

    $pdo->beginTransaction();
    try {
        $insert = $pdo->prepare(
            'INSERT IGNORE INTO site_event_log
             (event_id,event_kind,event_name,schema_version,occurred_at,payload_json,payload_sha256,created_at)
             VALUES (:event_id,:event_kind,:event_name,:schema_version,:occurred_at,:payload_json,:payload_sha256,NOW(6))'
        );
        $insert->execute(array(
            ':event_id' => $eventId,
            ':event_kind' => $kind,
            ':event_name' => $eventName,
            ':schema_version' => $schemaVersion,
            ':occurred_at' => $occurredAt,
            ':payload_json' => $json,
            ':payload_sha256' => $hash,
        ));

        $select = $pdo->prepare(
            'SELECT id,payload_sha256 FROM site_event_log WHERE event_id=:event_id LIMIT 1 FOR UPDATE'
        );
        $select->execute(array(':event_id' => $eventId));
        $row = $select->fetch();
        if (!$row) {
            throw new RuntimeException('Unable to persist event journal row.');
        }
        if (!hash_equals((string) $row['payload_sha256'], $hash)) {
            throw new RuntimeException('event_id was already used with a different payload.');
        }

        $eventLogId = (int) $row['id'];
        foreach ($destinations as $destination) {
            $destination = substr(trim((string) $destination), 0, 64);
            if ($destination === '' || !salsys_event_destination_enabled($destination)) {
                continue;
            }
            $delivery = $pdo->prepare(
                "INSERT IGNORE INTO site_event_deliveries
                 (event_log_id,destination,status,attempt_count,next_attempt_at,created_at,updated_at)
                 VALUES (:event_log_id,:destination,'pending',0,NOW(6),NOW(6),NOW(6))"
            );
            $delivery->execute(array(
                ':event_log_id' => $eventLogId,
                ':destination' => $destination,
            ));
        }

        $pdo->commit();
        return array(
            'ok' => true,
            'event_log_id' => $eventLogId,
            'event_id' => $eventId,
            'duplicate' => $insert->rowCount() === 0,
        );
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

function salsys_event_http_post($url, array $payload, array $headers)
{
    $config = salsys_event_config();
    $body = salsys_event_json_encode($payload);
    $headers[] = 'Content-Type: application/json';
    $headers[] = 'Accept: application/json';

    $ch = curl_init($url);
    curl_setopt_array($ch, array(
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT_MS => isset($config['connect_timeout_ms']) ? (int) $config['connect_timeout_ms'] : 750,
        CURLOPT_TIMEOUT_MS => isset($config['request_timeout_ms']) ? (int) $config['request_timeout_ms'] : 2000,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => $body,
    ));

    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    $decoded = is_string($response) ? json_decode($response, true) : null;
    return array(
        'ok' => is_string($response) && $status >= 200 && $status < 300,
        'status' => $status,
        'body' => is_array($decoded) ? $decoded : null,
        'error' => $response === false ? ($error ?: 'network_error') : null,
    );
}

function salsys_event_deliver_salsys(array $journal)
{
    $config = salsys_event_config();
    $adapter = $config['destinations']['salsys'];
    $baseUrl = rtrim((string) $adapter['base_url'], '/');
    $kind = (string) $journal['event_kind'];
    $payload = json_decode((string) $journal['payload_json'], true);
    if (!is_array($payload)) {
        throw new RuntimeException('Stored event payload is invalid JSON.');
    }

    $headers = array();
    if ($kind === 'browser_event') {
        $path = isset($adapter['browser_path']) ? $adapter['browser_path'] : '/api/events/browser/v1';
        $headers[] = 'Origin: ' . (string) $config['site_origin'];
    } elseif ($kind === 'consent') {
        $path = isset($adapter['consent_path']) ? $adapter['consent_path'] : '/api/privacy/consent/v1';
        $headers[] = 'Origin: ' . (string) $config['site_origin'];
    } elseif ($kind === 'server_event') {
        $path = isset($adapter['server_path']) ? $adapter['server_path'] : '/api/events/v1';
        $sourceKey = isset($adapter['source_key']) ? trim((string) $adapter['source_key']) : '';
        $secret = isset($adapter['source_secret']) ? trim((string) $adapter['source_secret']) : '';
        if ($sourceKey === '' || $secret === '') {
            throw new RuntimeException('Salsys server-event source credentials are not configured.');
        }
        $headers[] = 'X-Salsys-Source-Key: ' . $sourceKey;
        $headers[] = 'Authorization: Bearer ' . $secret;
    } else {
        throw new RuntimeException('Unsupported event journal kind.');
    }

    return salsys_event_http_post($baseUrl . $path, $payload, $headers);
}

function salsys_event_backoff_seconds($attempt)
{
    $attempt = max(1, (int) $attempt);
    return min(3600, 15 * (int) pow(2, min($attempt - 1, 8)));
}

function salsys_event_claim_deliveries($destination, $limit)
{
    $pdo = salsys_event_pdo();
    $config = salsys_event_config();
    $leaseSeconds = isset($config['lease_seconds']) ? max(30, (int) $config['lease_seconds']) : 120;
    $limit = max(1, min((int) $limit, 200));
    $leaseToken = bin2hex(random_bytes(16));

    $pdo->beginTransaction();
    try {
        $sql = "SELECT d.id
                FROM site_event_deliveries d
                WHERE d.destination=:destination
                  AND (
                    (d.status IN ('pending','failed') AND (d.next_attempt_at IS NULL OR d.next_attempt_at<=NOW(6)))
                    OR (d.status='delivering' AND d.locked_at < DATE_SUB(NOW(6), INTERVAL " . $leaseSeconds . " SECOND))
                  )
                ORDER BY d.id ASC
                LIMIT " . $limit . " FOR UPDATE";
        $stmt = $pdo->prepare($sql);
        $stmt->execute(array(':destination' => $destination));
        $ids = array_map('intval', array_column($stmt->fetchAll(), 'id'));

        if (!$ids) {
            $pdo->commit();
            return array();
        }

        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $update = $pdo->prepare(
            "UPDATE site_event_deliveries
             SET status='delivering', locked_at=NOW(6), lease_token=?, updated_at=NOW(6)
             WHERE id IN (" . $placeholders . ")"
        );
        $update->execute(array_merge(array($leaseToken), $ids));
        $pdo->commit();

        $load = $pdo->prepare(
            "SELECT d.id AS delivery_id,d.destination,d.attempt_count,d.lease_token,
                    e.id AS event_log_id,e.event_id,e.event_kind,e.event_name,e.payload_json
             FROM site_event_deliveries d
             JOIN site_event_log e ON e.id=d.event_log_id
             WHERE d.lease_token=? AND d.id IN (" . $placeholders . ")
             ORDER BY d.id ASC"
        );
        $load->execute(array_merge(array($leaseToken), $ids));
        return $load->fetchAll();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

function salsys_event_finish_delivery(array $delivery, array $result)
{
    $pdo = salsys_event_pdo();
    $config = salsys_event_config();
    $attempt = ((int) $delivery['attempt_count']) + 1;
    $maxAttempts = isset($config['max_attempts']) ? max(1, (int) $config['max_attempts']) : 8;
    $success = !empty($result['ok']);

    if ($success) {
        $stmt = $pdo->prepare(
            "UPDATE site_event_deliveries
             SET status='delivered',attempt_count=:attempt,last_http_status=:http_status,
                 last_error=NULL,delivered_at=NOW(6),next_attempt_at=NULL,locked_at=NULL,lease_token=NULL,updated_at=NOW(6)
             WHERE id=:id AND lease_token=:lease_token"
        );
        $stmt->execute(array(
            ':attempt' => $attempt,
            ':http_status' => isset($result['status']) ? (int) $result['status'] : null,
            ':id' => (int) $delivery['delivery_id'],
            ':lease_token' => (string) $delivery['lease_token'],
        ));
        return;
    }

    $dead = $attempt >= $maxAttempts;
    $error = isset($result['error']) && $result['error']
        ? (string) $result['error']
        : ('http_' . (isset($result['status']) ? (int) $result['status'] : 0));
    $error = substr($error, 0, 1000);
    $delay = salsys_event_backoff_seconds($attempt);

    $stmt = $pdo->prepare(
        "UPDATE site_event_deliveries
         SET status=:status,attempt_count=:attempt,last_http_status=:http_status,last_error=:last_error,
             next_attempt_at=" . ($dead ? 'NULL' : 'DATE_ADD(NOW(6), INTERVAL :delay SECOND)') . ",
             locked_at=NULL,lease_token=NULL,updated_at=NOW(6)
         WHERE id=:id AND lease_token=:lease_token"
    );
    $params = array(
        ':status' => $dead ? 'dead_letter' : 'failed',
        ':attempt' => $attempt,
        ':http_status' => isset($result['status']) ? (int) $result['status'] : null,
        ':last_error' => $error,
        ':id' => (int) $delivery['delivery_id'],
        ':lease_token' => (string) $delivery['lease_token'],
    );
    if (!$dead) {
        $params[':delay'] = $delay;
    }
    $stmt->execute($params);
}

function salsys_event_run_worker($destination = 'salsys', $limit = null)
{
    $config = salsys_event_config();
    if ($limit === null) {
        $limit = isset($config['batch_size']) ? (int) $config['batch_size'] : 50;
    }
    $claimed = salsys_event_claim_deliveries($destination, $limit);
    $summary = array('claimed' => count($claimed), 'delivered' => 0, 'failed' => 0);

    foreach ($claimed as $delivery) {
        try {
            if ($destination !== 'salsys') {
                throw new RuntimeException('No adapter registered for destination ' . $destination . '.');
            }
            $result = salsys_event_deliver_salsys($delivery);
        } catch (Throwable $error) {
            $result = array('ok' => false, 'status' => 0, 'error' => $error->getMessage());
        }
        salsys_event_finish_delivery($delivery, $result);
        if (!empty($result['ok'])) {
            $summary['delivered']++;
        } else {
            $summary['failed']++;
        }
    }

    return $summary;
}

function salsys_event_attempt_immediate($eventLogId, $destination = 'salsys')
{
    $config = salsys_event_config();
    if (empty($config['immediate_delivery'])) {
        return array('attempted' => false);
    }

    // Claiming the global next batch is intentional: it drains older durable
    // work first and preserves event ordering for low-volume website relays.
    $summary = salsys_event_run_worker($destination, 5);
    $summary['attempted'] = true;
    $summary['event_log_id'] = (int) $eventLogId;
    return $summary;
}

function salsys_event_emit_browser(array $input)
{
    $event = salsys_event_validate_browser_event($input);
    $stored = salsys_event_store($event, 'browser_event', $event['event_name']);
    $stored['delivery'] = salsys_event_attempt_immediate($stored['event_log_id'], 'salsys');
    return $stored;
}

function salsys_event_emit_consent(array $input)
{
    $eventId = salsys_event_clean_text(isset($input['event_id']) ? $input['event_id'] : null, 190);
    $visitorId = salsys_event_clean_text(
        isset($input['visitor_id']) ? $input['visitor_id'] : (isset($input['anonymous_visitor_id']) ? $input['anonymous_visitor_id'] : null),
        180
    );
    $decisions = isset($input['decisions']) && is_array($input['decisions']) ? $input['decisions'] : null;
    if (!$eventId || !$visitorId || !$decisions) {
        throw new RuntimeException('event_id, visitor_id and decisions are required.');
    }

    $allowedPurposes = array('analytics', 'marketing', 'advertising', 'sale_sharing', 'personalization');
    $allowedDecisions = array('granted', 'denied', 'withdrawn', 'opted_out', 'limited');
    $clean = array();
    foreach ($decisions as $purpose => $decision) {
        $purpose = strtolower(trim((string) $purpose));
        $decision = strtolower(trim((string) $decision));
        if (in_array($purpose, $allowedPurposes, true) && in_array($decision, $allowedDecisions, true)) {
            $clean[$purpose] = $decision;
        }
    }
    if (!$clean) {
        throw new RuntimeException('No supported privacy decisions supplied.');
    }

    $payload = array(
        'event_id' => $eventId,
        'visitor_id' => $visitorId,
        'occurred_at' => isset($input['occurred_at']) ? substr((string) $input['occurred_at'], 0, 80) : gmdate('c'),
        'gpc' => !empty($input['gpc']),
        'decisions' => $clean,
    );

    $stored = salsys_event_store($payload, 'consent', 'privacy.consent_changed');
    $stored['delivery'] = salsys_event_attempt_immediate($stored['event_log_id'], 'salsys');
    return $stored;
}

function salsys_event_emit_server($eventName, array $properties, array $options = array())
{
    $eventName = strtolower(trim((string) $eventName));
    if (!preg_match('/^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$/', $eventName)) {
        throw new RuntimeException('Server event name must use a registered family namespace.');
    }

    $payload = array(
        'event_id' => isset($options['event_id']) ? substr((string) $options['event_id'], 0, 190) : salsys_event_uuid('evt'),
        'event_name' => $eventName,
        'schema_version' => isset($options['schema_version']) ? max(1, (int) $options['schema_version']) : 1,
        'occurred_at' => isset($options['occurred_at']) ? (string) $options['occurred_at'] : gmdate('c'),
        'properties' => $properties,
        'context' => isset($options['context']) && is_array($options['context']) ? $options['context'] : array(),
        'metadata' => isset($options['metadata']) && is_array($options['metadata']) ? $options['metadata'] : array(),
    );

    foreach (array(
        'anonymous_visitor_id',
        'session_key',
        'external_message_id',
        'site',
    ) as $key) {
        if (isset($options[$key]) && $options[$key] !== '') {
            $payload[$key] = $options[$key];
        }
    }

    $stored = salsys_event_store($payload, 'server_event', $eventName);
    $stored['delivery'] = salsys_event_attempt_immediate($stored['event_log_id'], 'salsys');
    return $stored;
}

function salsys_event_cleanup()
{
    $config = salsys_event_config();
    $days = isset($config['delivered_retention_days']) ? max(1, (int) $config['delivered_retention_days']) : 30;
    $pdo = salsys_event_pdo();

    // Only delete a journal event when every destination has delivered it and
    // the last delivery is outside the configured local retention window.
    $sql = "DELETE e FROM site_event_log e
            WHERE e.created_at < DATE_SUB(NOW(6), INTERVAL " . $days . " DAY)
              AND NOT EXISTS (
                SELECT 1 FROM site_event_deliveries d
                WHERE d.event_log_id=e.id AND d.status<>'delivered'
              )";
    return $pdo->exec($sql);
}

function salsys_event_json_response(array $payload, $status = 200)
{
    if (!headers_sent()) {
        http_response_code((int) $status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
    }
    echo salsys_event_json_encode($payload);
}
