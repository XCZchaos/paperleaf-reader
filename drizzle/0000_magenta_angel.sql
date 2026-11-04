CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `collections_owner` ON `collections` (`owner`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`paper_id` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`quote` text DEFAULT '' NOT NULL,
	`page` integer DEFAULT 1 NOT NULL,
	`color` text DEFAULT 'yellow' NOT NULL,
	`rects` text DEFAULT '[]' NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notes_paper` ON `notes` (`owner`,`paper_id`);--> statement-breakpoint
CREATE TABLE `papers` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`authors` text DEFAULT '' NOT NULL,
	`year` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`collection` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'unread' NOT NULL,
	`favorite` integer DEFAULT 0 NOT NULL,
	`page` integer DEFAULT 1 NOT NULL,
	`pages` integer DEFAULT 1 NOT NULL,
	`filename` text NOT NULL,
	`size` integer NOT NULL,
	`hash` text NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	`opened` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `papers_owner` ON `papers` (`owner`);--> statement-breakpoint
CREATE INDEX `papers_hash` ON `papers` (`owner`,`hash`);