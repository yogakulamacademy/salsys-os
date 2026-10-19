<?php

declare(strict_types=1);

return [
    // Public website identity. Keep this stable because attribution and tenant
    // resolution depend on the canonical site/origin.
    'site' => 'www.example.com',
    'site_origin' => 'https://www.example.com',

    // Local first-party event store/outbox. Prefer environment variables or a
    // hosting secret manager; do not commit real database credentials.
    'db_dsn' => getenv('SALSYS_TRACKING_DB_DSN') ?: 'mysql:host=127.0.0.1;dbname=example;charset=utf8mb4',
    'db_user' => getenv('SALSYS_TRACKING_DB_USER') ?: '',
    'db_password' => getenv('SALSYS_TRACKING_DB_PASSWORD') ?: '',

    // SalsysOS is one delivery adapter, not the website source of truth.
    'salsys_base_url' => getenv('SALSYS_EVENTS_BASE_URL') ?: 'https://salsysos.com',
    'salsys_source_key' => getenv('SALSYS_TRACKING_SOURCE_KEY') ?: '',
    'salsys_source_secret' => getenv('SALSYS_TRACKING_SOURCE_SECRET') ?: '',

    // Browser analytics endpoint protection.
    'max_browser_payload_bytes' => 65536,

    // Delivery behavior. The public request is acknowledged after the event is
    // committed locally; upstream delivery is opportunistic and retryable.
    'delivery_connect_timeout_seconds' => 1,
    'delivery_timeout_seconds' => 3,
    'delivery_max_attempts' => 12,
];
