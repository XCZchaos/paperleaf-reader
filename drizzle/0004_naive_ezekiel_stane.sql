CREATE TABLE `account_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`created` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_owner` ON `account_sessions` (`owner`);--> statement-breakpoint
CREATE INDEX `sessions_expiry` ON `account_sessions` (`expires`);--> statement-breakpoint
CREATE TABLE `accounts` (
	`owner` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`password_salt` text NOT NULL,
	`password_hash` text NOT NULL,
	`recovery_hash` text NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`blocked_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_username_unique` ON `accounts` (`username`);--> statement-breakpoint
CREATE TABLE `reading_states` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`paper_id` text NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reading_states_owner` ON `reading_states` (`owner`,`paper_id`);