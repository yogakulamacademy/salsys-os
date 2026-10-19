<?php

declare(strict_types=1);

require_once __DIR__ . '/SalsysTracking.php';

$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    throw new RuntimeException('Missing tracking config.php. Copy config.example.php and configure it outside version control.');
}

$config = require $configPath;
if (!is_array($config)) {
    throw new RuntimeException('Tracking config.php must return an array.');
}

$pdo = new PDO(
    (string)$config['db_dsn'],
    (string)$config['db_user'],
    (string)$config['db_password'],
    [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]
);

return new SalsysTracking($pdo, $config);
