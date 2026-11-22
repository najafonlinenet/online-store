import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

/** The store's one settings row (id "store"). */
export const storeSettings = sqliteTable("store_settings", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  currency: text("currency").notNull(),
  shippingRate: integer("shipping_rate").notNull(),
  freeShippingThreshold: integer("free_shipping_threshold"),
  lowStockThreshold: integer("low_stock_threshold").notNull(),
  storefrontOpen: integer("storefront_open", { mode: "boolean" }).notNull(),
});

/** Everyone who has opened the app, keyed by the Gateway's user id. */
export const members = sqliteTable("members", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  canProducts: integer("can_products", { mode: "boolean" }).notNull(),
  canOrders: integer("can_orders", { mode: "boolean" }).notNull(),
  canCustomers: integer("can_customers", { mode: "boolean" }).notNull(),
  createdAt: text("created_at").notNull().default(now),
});

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    handle: text("handle").notNull(),
    description: text("description").notNull().default(""),
    imageKey: text("image_key"),
    status: text("status", { enum: ["draft", "active", "archived"] }).notNull(),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [uniqueIndex("products_handle").on(t.handle)],
);

export const variants = sqliteTable(
  "variants",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    label: text("label").notNull(),
    sku: text("sku").notNull().default(""),
    price: integer("price").notNull(),
    compareAtPrice: integer("compare_at_price"),
    trackInventory: integer("track_inventory", { mode: "boolean" }).notNull(),
    quantity: integer("quantity").notNull().default(0),
  },
  (t) => [
    index("variants_product").on(t.productId),
    check("variants_quantity_nonnegative", sql`${t.quantity} >= 0`),
    check("variants_price_nonnegative", sql`${t.price} >= 0`),
  ],
);

export const collections = sqliteTable(
  "collections",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    handle: text("handle").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("collections_handle").on(t.handle)],
);

export const productCollections = sqliteTable(
  "product_collections",
  {
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.productId, t.collectionId] })],
);

export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull().default(""),
    address: text("address"),
    notes: text("notes").notNull().default(""),
    orderCount: integer("order_count").notNull().default(0),
    totalSpent: integer("total_spent").notNull().default(0),
    lastOrderAt: text("last_order_at"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("customers_email").on(t.email)],
);

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    number: integer("number").notNull(),
    token: text("token").notNull(),
    customerId: text("customer_id").references(() => customers.id),
    email: text("email").notNull(),
    name: text("name").notNull(),
    address: text("address").notNull(),
    currency: text("currency").notNull(),
    subtotal: integer("subtotal").notNull(),
    discountCode: text("discount_code"),
    discountAmount: integer("discount_amount").notNull().default(0),
    shipping: integer("shipping").notNull(),
    total: integer("total").notNull(),
    paymentStatus: text("payment_status", {
      enum: ["pending", "paid", "refunded"],
    }).notNull(),
    fulfillmentStatus: text("fulfillment_status", {
      enum: ["unfulfilled", "fulfilled"],
    }).notNull(),
    cancelledAt: text("cancelled_at"),
    carrier: text("carrier"),
    trackingNumber: text("tracking_number"),
    stripeSessionId: text("stripe_session_id"),
    stripePaymentIntent: text("stripe_payment_intent"),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("orders_number").on(t.number),
    uniqueIndex("orders_token").on(t.token),
    index("orders_customer").on(t.customerId),
  ],
);

export const orderLines = sqliteTable(
  "order_lines",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id"),
    variantId: text("variant_id"),
    title: text("title").notNull(),
    variantLabel: text("variant_label").notNull(),
    sku: text("sku").notNull(),
    price: integer("price").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (t) => [
    index("order_lines_order").on(t.orderId),
    index("order_lines_product").on(t.productId),
  ],
);

export const orderEvents = sqliteTable(
  "order_events",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    detail: text("detail").notNull().default(""),
    actor: text("actor"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("order_events_order").on(t.orderId)],
);

export const inventoryAdjustments = sqliteTable(
  "inventory_adjustments",
  {
    id: text("id").primaryKey(),
    variantId: text("variant_id")
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    quantityAfter: integer("quantity_after").notNull(),
    reason: text("reason").notNull(),
    actor: text("actor"),
    orderNumber: integer("order_number"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("inventory_adjustments_variant").on(t.variantId)],
);

export const discounts = sqliteTable(
  "discounts",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    kind: text("kind", { enum: ["percentage", "fixed"] }).notNull(),
    value: integer("value").notNull(),
    minSubtotal: integer("min_subtotal"),
    usageLimit: integer("usage_limit"),
    usageCount: integer("usage_count").notNull().default(0),
    startsAt: text("starts_at"),
    endsAt: text("ends_at"),
    enabled: integer("enabled", { mode: "boolean" }).notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("discounts_code").on(t.code),
    check(
      "discounts_usage_within_limit",
      sql`${t.usageLimit} IS NULL OR ${t.usageCount} <= ${t.usageLimit}`,
    ),
  ],
);
