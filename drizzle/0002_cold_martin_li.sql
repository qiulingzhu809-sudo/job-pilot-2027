DROP INDEX `jobs_user_official_url_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_user_company_role_url_idx` ON `jobs` (`user_id`,`company`,`role`,`official_url`);