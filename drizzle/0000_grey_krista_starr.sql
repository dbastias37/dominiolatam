CREATE TABLE `dominio_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`host` text NOT NULL,
	`status` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `dominio_rooms_host` ON `dominio_rooms` (`host`);--> statement-breakpoint
CREATE INDEX `dominio_rooms_updated` ON `dominio_rooms` (`updated_at`);