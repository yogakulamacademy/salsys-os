<?php

declare(strict_types=1);

return [
    // Keep credentials outside the public web root when possible. Environment
    // variables are preferred; these defaults intentionally contain no secret.
    'database_dsn' => getenv('SALSYS_TRACKING_DB_DSN') ?: 'mysql:host=127.0.0.1;dbname=YOUR_DATABASE;charset=utf8mb4',
    'database_user' => getenv('SALSYS_TRACKING_DB_USER') ?: 'YOUR_DATABASE_USER',
    'database_password' => getenv('SALSYS_TRACKING_DB_PASSWORD') ?: 'YOUR_DATABASE_PASSWORD',

    'salsys_base_url' => rtrim(getenv('SALSYS_TRACKING_BASE_URL') ?: 'https://salsysos.com', '/'),
    'source_key' => getenv('SALSYS_TRACKING_SOURCE_KEY') ?: '',
    'source_secret' => getenv('SALSYS_TRACKING_SOURCE_SECRET') ?: '',

    'request_timeout_seconds' => 4,
    'max_attempts' => 8,
    'worker_batch_size' => 25,

    // Optional shared secret for a future local health endpoint or manual worker
    // invocation. Do not expose this value in browser JavaScript.
    'worker_secret' => getenv('SALSYS_TRACKING_WORKER_SECRET') ?: '',
];
