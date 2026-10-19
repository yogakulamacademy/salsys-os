-- Universal first-party event journal for PHP/MySQL websites.
-- The event log is destination-neutral. Delivery state is stored separately so
-- additional adapters (GA4, Meta CAPI, warehouse, etc.) can consume the exact
-- same event without changing the website event contract.

CREATE TABLE IF NOT EXISTS site_event_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_id VARCHAR(190) NOT NULL,
    event_kind VARCHAR(32) NOT NULL,
    event_name VARCHAR(120) NULL,
    schema_version INT UNSIGNED NOT NULL DEFAULT 1,
    occurred_at DATETIME(6) NULL,
    payload_json LONGTEXT NOT NULL,
    payload_sha256 CHAR(64) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_site_event_log_event_id (event_id),
    KEY idx_site_event_log_kind_created (event_kind, created_at),
    KEY idx_site_event_log_name_created (event_name, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_event_deliveries (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_log_id BIGINT UNSIGNED NOT NULL,
    destination VARCHAR(64) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
    next_attempt_at DATETIME(6) NULL,
    locked_at DATETIME(6) NULL,
    lease_token VARCHAR(64) NULL,
    last_http_status SMALLINT UNSIGNED NULL,
    last_error VARCHAR(1000) NULL,
    delivered_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_site_event_delivery_target (event_log_id, destination),
    KEY idx_site_event_delivery_work (destination, status, next_attempt_at, id),
    KEY idx_site_event_delivery_lease (status, locked_at),
    CONSTRAINT fk_site_event_delivery_log
        FOREIGN KEY (event_log_id) REFERENCES site_event_log(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
