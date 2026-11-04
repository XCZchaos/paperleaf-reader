CREATE TABLE `research` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`paper_id` text NOT NULL,
	`kind` text NOT NULL,
	`question` text DEFAULT '' NOT NULL,
	`text` text NOT NULL,
	`deck` text DEFAULT 'null' NOT NULL,
	`page` integer NOT NULL,
	`pages` text NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `research_paper` ON `research` (`owner`,`paper_id`);