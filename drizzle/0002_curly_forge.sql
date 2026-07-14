CREATE TABLE `community_needs` (
	`id` text PRIMARY KEY NOT NULL,
	`community` text NOT NULL,
	`category` text NOT NULL,
	`summary` text NOT NULL,
	`approximate_location` text,
	`resident_impact` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`reviewed_at` text,
	`correction_note` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `community_needs_fingerprint_idx` ON `community_needs` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `community_needs_status_created_idx` ON `community_needs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `community_needs_community_category_idx` ON `community_needs` (`community`,`category`);