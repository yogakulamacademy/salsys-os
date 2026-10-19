CREATE TABLE IF NOT EXISTS tracking_event_outbox (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_id VARCHAR(160) NOT NULL,
    event_kind VARCHAR(24) NOT NULL DEFAULT 'event',
    payload_json LONGTEXT NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    attempts INT UNSIGNED NOT NULL DEFAULT 0,
    next_attempt_at DATETIME(6) NULL,
    last_attempt_at DATETIME(6) NULL,
    delivered_at DATETIME(6) NULL,
    last_http_status SMALLINT UNSIGNED NULL,
    last_error VARCHAR(1000) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_tracking_event_outbox_kind_event (event_kind, event_id),
    KEY idx_tracking_event_outbox_delivery (status, next_attempt_at, id),
    KEY idx_tracking_event_outbox_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
