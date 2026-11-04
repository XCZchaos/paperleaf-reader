CREATE TABLE `vocabulary` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`word` text NOT NULL,
	`normalized_word` text NOT NULL,
	`details` text NOT NULL,
	`answer` text NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL,
	`mastered` integer DEFAULT 0 NOT NULL,
	`encounters` integer DEFAULT 1 NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vocabulary_owner_word` ON `vocabulary` (`owner`,`normalized_word`);--> statement-breakpoint
CREATE INDEX `vocabulary_owner_updated` ON `vocabulary` (`owner`,`updated`);