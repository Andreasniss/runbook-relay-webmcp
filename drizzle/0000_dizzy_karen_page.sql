CREATE TABLE `approvals` (
	`approval_id` text PRIMARY KEY NOT NULL,
	`session_key` text NOT NULL,
	`action_digest` text NOT NULL,
	`resource_version` integer NOT NULL,
	`approver_identity` text NOT NULL,
	`approved_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	FOREIGN KEY (`session_key`) REFERENCES `control_sessions`(`session_key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_approvals_session_action_version` ON `approvals` (`session_key`,`action_digest`,`resource_version`);--> statement-breakpoint
CREATE INDEX `idx_approvals_session_expiry` ON `approvals` (`session_key`,`expires_at`);--> statement-breakpoint
CREATE TABLE `control_sessions` (
	`session_key` text PRIMARY KEY NOT NULL,
	`identity_label` text NOT NULL,
	`incident_id` text NOT NULL,
	`status` text NOT NULL,
	`resource_version` integer NOT NULL,
	`staged_mitigation_id` text,
	`action_digest` text,
	`idempotency_key` text,
	`last_receipt_hash` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `executions` (
	`execution_id` text PRIMARY KEY NOT NULL,
	`session_key` text NOT NULL,
	`action_digest` text NOT NULL,
	`resource_version` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`outcome` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_key`) REFERENCES `control_sessions`(`session_key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_executions_session_idempotency` ON `executions` (`session_key`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_executions_session_action` ON `executions` (`session_key`,`action_digest`);--> statement-breakpoint
CREATE TABLE `receipts` (
	`receipt_id` text PRIMARY KEY NOT NULL,
	`session_key` text NOT NULL,
	`kind` text NOT NULL,
	`tool` text NOT NULL,
	`event` text NOT NULL,
	`actor_channel` text NOT NULL,
	`actor_identity` text NOT NULL,
	`outcome` text NOT NULL,
	`input_json` text NOT NULL,
	`result_json` text NOT NULL,
	`detail` text NOT NULL,
	`action_digest` text,
	`resource_version` integer NOT NULL,
	`previous_hash` text,
	`receipt_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_key`) REFERENCES `control_sessions`(`session_key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_receipts_hash` ON `receipts` (`receipt_hash`);--> statement-breakpoint
CREATE INDEX `idx_receipts_session_created` ON `receipts` (`session_key`,`created_at`);