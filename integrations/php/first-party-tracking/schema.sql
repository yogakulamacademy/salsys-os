-- Salsys Event Intelligence - portable first-party website event store/outbox
-- MySQL 8+ / MariaDB variants may require small JSON/default syntax adjustments.

CREATE TABLE IF NOT EXISTS site_tracking_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id VARCHAR(180) NOT NULL,
  event_kind ENUM('event','consent') NOT NULL,
  event_name VARCHAR(160) NULL,
  occurred_at DATETIME(6) NULL,
  payload_json JSON NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_site_tracking_events_event_id (event_id),
  KEY idx_site_tracking_events_created (created_at),
  KEY idx_site_tracking_events_name (event_name, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_tracking_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tracking_event_id BIGINT UNSIGNED NOT NULL,
  destination VARCHAR(64) NOT NULL,
  status ENUM('pending','processing','delivered','failed') NOT NULL DEFAULT 'pending',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME(6) NULL,
  claimed_at DATETIME(6) NULL,
  delivered_at DATETIME(6) NULL,
  last_http_status SMALLINT UNSIGNED NULL,
  last_error VARCHAR(1000) NULL,
  response_excerpt VARCHAR(2000) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_site_tracking_delivery_destination (tracking_event_id, destination),
  KEY idx_site_tracking_delivery_due (destination, status, next_attempt_at, id),
  CONSTRAINT fk_site_tracking_delivery_event
    FOREIGN KEY (tracking_event_id) REFERENCES site_tracking_events(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
