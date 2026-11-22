CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`handle` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collections_handle` ON `collections` (`handle`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`address` text,
	`notes` text DEFAULT '' NOT NULL,
	`order_count` integer DEFAULT 0 NOT NULL,
	`total_spent` integer DEFAULT 0 NOT NULL,
	`last_order_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_email` ON `customers` (`email`);--> statement-breakpoint
CREATE TABLE `discounts` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`kind` text NOT NULL,
	`value` integer NOT NULL,
	`min_subtotal` integer,
	`usage_limit` integer,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`starts_at` text,
	`ends_at` text,
	`enabled` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "discounts_usage_within_limit" CHECK("discounts"."usage_limit" IS NULL OR "discounts"."usage_count" <= "discounts"."usage_limit")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discounts_code` ON `discounts` (`code`);--> statement-breakpoint
CREATE TABLE `inventory_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`variant_id` text NOT NULL,
	`delta` integer NOT NULL,
	`quantity_after` integer NOT NULL,
	`reason` text NOT NULL,
	`actor` text,
	`order_number` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inventory_adjustments_variant` ON `inventory_adjustments` (`variant_id`);--> statement-breakpoint
CREATE TABLE `members` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`can_products` integer NOT NULL,
	`can_orders` integer NOT NULL,
	`can_customers` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order_events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`kind` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`actor` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `order_events_order` ON `order_events` (`order_id`);--> statement-breakpoint
CREATE TABLE `order_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text,
	`variant_id` text,
	`title` text NOT NULL,
	`variant_label` text NOT NULL,
	`sku` text NOT NULL,
	`price` integer NOT NULL,
	`quantity` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `order_lines_order` ON `order_lines` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_lines_product` ON `order_lines` (`product_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`token` text NOT NULL,
	`customer_id` text,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`currency` text NOT NULL,
	`subtotal` integer NOT NULL,
	`discount_code` text,
	`discount_amount` integer DEFAULT 0 NOT NULL,
	`shipping` integer NOT NULL,
	`total` integer NOT NULL,
	`payment_status` text NOT NULL,
	`fulfillment_status` text NOT NULL,
	`cancelled_at` text,
	`carrier` text,
	`tracking_number` text,
	`stripe_session_id` text,
	`stripe_payment_intent` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_number` ON `orders` (`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_token` ON `orders` (`token`);--> statement-breakpoint
CREATE INDEX `orders_customer` ON `orders` (`customer_id`);--> statement-breakpoint
CREATE TABLE `product_collections` (
	`product_id` text NOT NULL,
	`collection_id` text NOT NULL,
	PRIMARY KEY(`product_id`, `collection_id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`handle` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`image_key` text,
	`status` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_handle` ON `products` (`handle`);--> statement-breakpoint
CREATE TABLE `store_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`currency` text NOT NULL,
	`shipping_rate` integer NOT NULL,
	`free_shipping_threshold` integer,
	`low_stock_threshold` integer NOT NULL,
	`storefront_open` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `variants` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`position` integer NOT NULL,
	`label` text NOT NULL,
	`sku` text DEFAULT '' NOT NULL,
	`price` integer NOT NULL,
	`compare_at_price` integer,
	`track_inventory` integer NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "variants_quantity_nonnegative" CHECK("variants"."quantity" >= 0),
	CONSTRAINT "variants_price_nonnegative" CHECK("variants"."price" >= 0)
);
--> statement-breakpoint
CREATE INDEX `variants_product` ON `variants` (`product_id`);