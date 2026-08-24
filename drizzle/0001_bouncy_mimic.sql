PRAGMA foreign_keys=OFF;--> statement-breakpoint
DELETE FROM `emails`;--> statement-breakpoint
DELETE FROM `qr_sessions`;--> statement-breakpoint
DELETE FROM `wechat_accounts`;--> statement-breakpoint
CREATE TABLE `__new_wechat_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`nickname` text NOT NULL,
	`email` text,
	`openid` text NOT NULL,
	`unionid` text,
	`avatar_color` text DEFAULT '#17b26a' NOT NULL,
	`status` text DEFAULT 'online' NOT NULL,
	`refresh_token_encrypted` text,
	`created_at` integer NOT NULL,
	`last_synced_at` integer
);
--> statement-breakpoint
DROP TABLE `wechat_accounts`;--> statement-breakpoint
ALTER TABLE `__new_wechat_accounts` RENAME TO `wechat_accounts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_wechat_accounts_email` ON `wechat_accounts` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_wechat_accounts_openid` ON `wechat_accounts` (`openid`);--> statement-breakpoint
CREATE INDEX `idx_wechat_accounts_status` ON `wechat_accounts` (`status`);
