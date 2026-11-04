CREATE TABLE `translation_paragraphs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`paper_id` text NOT NULL,
	`page` integer NOT NULL,
	`ordinal` integer NOT NULL,
	`original` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`updated` integer NOT NULL,
	`lease_token` text DEFAULT '' NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `translation_paragraph_position` ON `translation_paragraphs` (`owner`,`paper_id`,`page`,`ordinal`);--> statement-breakpoint
CREATE INDEX `translation_paragraph_queue` ON `translation_paragraphs` (`owner`,`paper_id`,`status`);--> statement-breakpoint
ALTER TABLE `research` ADD `conversation_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `research` ADD `parent_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `research` ADD `selection` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `research` ADD `effort` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `research` ADD `process` text DEFAULT 'null' NOT NULL;--> statement-breakpoint
CREATE INDEX `research_conversation` ON `research` (`owner`,`paper_id`,`conversation_id`,`created`);