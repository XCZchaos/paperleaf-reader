CREATE TABLE `translations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`translated` text NOT NULL,
	`created` integer NOT NULL
);
