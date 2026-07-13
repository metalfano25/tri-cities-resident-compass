CREATE TABLE `ingestion_locks` (
	`lock_name` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`last_started_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `live_payload_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`last_successful_at` text
);
--> statement-breakpoint
CREATE TABLE `record_versions` (
	`version_id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`content_fingerprint` text NOT NULL,
	`captured_at` text NOT NULL,
	`changed_fields` text NOT NULL,
	`prior_values` text NOT NULL,
	`current_values` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `record_versions_record_fingerprint_idx` ON `record_versions` (`record_id`,`content_fingerprint`);--> statement-breakpoint
CREATE INDEX `record_versions_record_captured_idx` ON `record_versions` (`record_id`,`captured_at`);--> statement-breakpoint
CREATE TABLE `source_records` (
	`record_id` text PRIMARY KEY NOT NULL,
	`record_family` text NOT NULL,
	`source_id` text NOT NULL,
	`publisher` text NOT NULL,
	`canonical_url` text NOT NULL,
	`community` text NOT NULL,
	`affected_area` text NOT NULL,
	`record_type` text NOT NULL,
	`topic_tags` text DEFAULT '[]' NOT NULL,
	`title` text NOT NULL,
	`factual_excerpt` text NOT NULL,
	`published_at` text,
	`start_at` text,
	`end_at` text,
	`deadline_at` text,
	`updated_at` text,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`content_changed_at` text NOT NULL,
	`lifecycle` text NOT NULL,
	`location_text` text,
	`latitude` real,
	`longitude` real,
	`content_fingerprint` text NOT NULL,
	`field_confidence` text NOT NULL,
	`record_payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `source_records_source_idx` ON `source_records` (`source_id`);--> statement-breakpoint
CREATE INDEX `source_records_community_lifecycle_idx` ON `source_records` (`community`,`lifecycle`);--> statement-breakpoint
CREATE INDEX `source_records_last_seen_idx` ON `source_records` (`last_seen_at`);--> statement-breakpoint
CREATE INDEX `source_records_start_idx` ON `source_records` (`start_at`);--> statement-breakpoint
CREATE INDEX `source_records_deadline_idx` ON `source_records` (`deadline_at`);--> statement-breakpoint
CREATE INDEX `source_records_canonical_family_idx` ON `source_records` (`canonical_url`,`record_family`);--> statement-breakpoint
CREATE TABLE `source_runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`community` text NOT NULL,
	`publisher` text NOT NULL,
	`canonical_url` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text NOT NULL,
	`status` text NOT NULL,
	`http_outcome` text,
	`item_count` integer NOT NULL,
	`parser_version` text NOT NULL,
	`last_successful_collection` text,
	`diagnostic_message` text
);
--> statement-breakpoint
CREATE INDEX `source_runs_source_completed_idx` ON `source_runs` (`source_id`,`completed_at`);--> statement-breakpoint
CREATE INDEX `source_runs_status_completed_idx` ON `source_runs` (`status`,`completed_at`);