CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`company` text NOT NULL,
	`role` text NOT NULL,
	`company_type` text NOT NULL,
	`industry` text NOT NULL,
	`base_json` text NOT NULL,
	`track` text NOT NULL,
	`tags_json` text NOT NULL,
	`batch` text NOT NULL,
	`graduation_year` integer NOT NULL,
	`official_url` text NOT NULL,
	`apply_status` text NOT NULL,
	`remote_interview` text NOT NULL,
	`verified_at` text NOT NULL,
	`duplicate_check` text NOT NULL,
	`score_tenths` integer NOT NULL,
	`score_reason` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_user_official_url_idx` ON `jobs` (`user_id`,`official_url`);