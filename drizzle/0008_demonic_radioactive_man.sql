DROP INDEX `translation_paragraph_position`;--> statement-breakpoint
ALTER TABLE `translation_paragraphs` ADD `extraction_mode` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `translation_paragraph_position` ON `translation_paragraphs` (`owner`,`paper_id`,`extraction_mode`,`page`,`ordinal`);