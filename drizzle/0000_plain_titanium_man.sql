CREATE TABLE `application_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`job_key` text NOT NULL,
	`status` text DEFAULT '关注' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `progress_user_job_idx` ON `application_progress` (`user_id`,`job_key`);--> statement-breakpoint
CREATE TABLE `search_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`brief` text NOT NULL,
	`status` text DEFAULT '待处理' NOT NULL,
	`created_at` integer NOT NULL
);
