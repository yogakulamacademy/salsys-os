<?php
/**
 * Copy outside the public web root when possible and load it from the relay
 * endpoints. Do not commit real credentials.
 */
return [
    'site_origin' => getenv('SALSYS_SITE_ORIGIN') ?: 'https://www.example.com',

    // Local website database. Reuse the website's existing PDO instance by
    // calling salsys_event_set_pdo($pdo) before using the helper if preferred.
    'database' => [
        'dsn' => getenv('SALSYS_TRACKING_DSN') ?: 'mysql:host=127.0.0.1;dbname=example;charset=utf8mb4',
        'user' => getenv('SALSYS_TRACKING_DB_USER') ?: '',
        'password' => getenv('SALSYS_TRACKING_DB_PASSWORD') ?: '',
    ],

    // SalsysOS is one adapter. The local event journal itself is destination-neutral.
    'destinations' => [
        'salsys' => [
            'enabled' => true,
            'base_url' => rtrim(getenv('SALSYS_EVENTS_BASE_URL') ?: 'https://salsysos.com', '/'),
            'source_key' => getenv('SALSYS_EVENTS_SOURCE_KEY') ?: '',
            'source_secret' => getenv('SALSYS_EVENTS_SOURCE_SECRET') ?: '',
            'browser_path' => '/api/events/browser/v1',
            'server_path' => '/api/events/v1',
            'consent_path' => '/api/privacy/consent/v1',
        ],
    ],

    'worker_token' => getenv('SALSYS_TRACKING_WORKER_TOKEN') ?: '',
    'max_request_bytes' => 65536,
    'connect_timeout_ms' => 750,
    'request_timeout_ms' => 2000,
    'immediate_delivery' => true,
    'max_attempts' => 8,
    'batch_size' => 50,
    'lease_seconds' => 120,
    'delivered_retention_days' => 30,
];
