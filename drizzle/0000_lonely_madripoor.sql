CREATE TABLE `emails` (
	`id` text PRIMARY KEY NOT NULL,
	`wechat_account_id` text NOT NULL,
	`sender_name` text NOT NULL,
	`sender_address` text,
	`subject` text NOT NULL,
	`preview` text DEFAULT '' NOT NULL,
	`category` text DEFAULT '通知' NOT NULL,
	`received_at` integer NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`is_starred` integer DEFAULT false NOT NULL,
	`raw_message_id` text,
	FOREIGN KEY (`wechat_account_id`) REFERENCES `wechat_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_emails_account_received` ON `emails` (`wechat_account_id`,`received_at`);--> statement-breakpoint
CREATE INDEX `idx_emails_received` ON `emails` (`received_at`);--> statement-breakpoint
CREATE INDEX `idx_emails_unread` ON `emails` (`is_read`,`received_at`);--> statement-breakpoint
CREATE INDEX `idx_emails_category` ON `emails` (`category`);--> statement-breakpoint
CREATE TABLE `qr_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qr_sessions_state_unique` ON `qr_sessions` (`state`);--> statement-breakpoint
CREATE TABLE `wechat_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`nickname` text NOT NULL,
	`email` text NOT NULL,
	`avatar_color` text DEFAULT '#17b26a' NOT NULL,
	`status` text DEFAULT 'online' NOT NULL,
	`refresh_token_encrypted` text,
	`created_at` integer NOT NULL,
	`last_synced_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_wechat_accounts_email` ON `wechat_accounts` (`email`);--> statement-breakpoint
CREATE INDEX `idx_wechat_accounts_status` ON `wechat_accounts` (`status`);