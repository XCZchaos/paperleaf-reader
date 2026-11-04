ALTER TABLE `papers` ADD `journal` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `papers` ADD `doi` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `papers` ADD `abstract` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `papers` ADD `original_filename` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `papers` ADD `metadata_source` text DEFAULT 'embedded' NOT NULL;