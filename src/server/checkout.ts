import { eq } from "drizzle-orm";
import { env, waitUntil } from "cloudflare:workers";
import { z } from "zod";
import { db } from "@/db";
import { discounts, orders } from "@/db/schema";
import { formatMoney } from "@/lib/money";
import { applyDiscount, shippingFor } from "./discountRules";
import { UserError } from "./errors";
import {
  createCheckoutSession,
  isReady,
  sendOrderEmail,
} from "./integrations";
import { cartLinesInput, resolveCart } from "./storefront";
import { getSettings } from "./settings";

export const addressSchema = z
  .object({
    line1: z.string().trim().min(1, "Enter a street address").max(200),
    line2: z.string().trim().max(200).optional().default(""),
    city: z.string().trim().min(1, "Enter a city").max(100),
    region: z.string().trim().max(100).optional().default(""),
    postalCode: z.string().trim().min(1, "Enter a postal code").max(20),
    country: z.string().trim().min(1, "Enter a country").max(80),
  })
  .strict();

export type Address = z.infer<typeof addressSchema>;

export const checkoutInput = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter a valid email"),
    name: z.string().trim().min(1, "Enter your name").max(120),
    address: addressSchema,
    code: z.string().trim().max(40).optional(),
    lines: cartLinesInput.min(1, "The cart is empty"),
  })
  .strict();

/** Places an order from a buyer's cart; prices and stock are read here, never taken from the client. */
export async function placeOrder(input: z.infer<typeof checkoutInput>, origin: string) {
  const settings = await getSettings();
  if (!settings.storefrontOpen) throw new UserError("The store is closed.", 403);

  const { lines } = await resolveCart(input.lines);
  for (const wanted of input.lines) {
    const line = lines.find((l) => l.variantId === wanted.variantId);
    if (!line) {
      throw new UserError("An item in the cart is no longer available.", 409);
    }
    if (line.available !== null && wanted.quantity > line.available) {
      throw new UserError(
        line.available === 0
          ? `${line.title} (${line.label}) is sold out.`
          : `Only ${line.available} of ${line.title} (${line.label}) left.`,
        409,
      );
    }
  }
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

  let discount: { id: string; code: string; amount: number } | null = null;
  if (input.code) {
    const [row] = await db
      .select()
      .from(discounts)
      .where(eq(discounts.code, input.code.toUpperCase()));
    if (!row) throw new UserError("That discount code doesn't exist.");
    const applied = applyDiscount(row, subtotal, new Date());
    if ("refused" in applied) throw new UserError(applied.refused);
    discount = { id: row.id, code: row.code, amount: applied.amount };
  }
  const discounted = subtotal - (discount?.amount ?? 0);
  const shipping = shippingFor(
    discounted,
    settings.shippingRate,
    settings.freeShippingThreshold,
  );
  const total = discounted + shipping;

  const orderId = crypto.randomUUID();
  const token = randomToken();
  const now = new Date().toISOString();
  const address = JSON.stringify(input.address);
  const orderNumber = {
    sql: "(SELECT number FROM orders WHERE id = ?)",
    params: [orderId],
  };

  const statements = [
    env.DB.prepare(
      `INSERT INTO customers (id, email, name, address, order_count, last_order_at, created_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(email) DO UPDATE SET name = excluded.name, address = excluded.address,
         order_count = customers.order_count + 1, last_order_at = excluded.last_order_at`,
    ).bind(crypto.randomUUID(), input.email, input.name, address, now, now),
    env.DB.prepare(
      `INSERT INTO orders (id, number, token, customer_id, email, name, address, currency, subtotal,
         discount_code, discount_amount, shipping, total, payment_status, fulfillment_status, created_at)
       VALUES (?, (SELECT COALESCE(MAX(number), 1000) + 1 FROM orders), ?,
         (SELECT id FROM customers WHERE email = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'unfulfilled', ?)`,
    ).bind(
      orderId,
      token,
      input.email,
      input.email,
      input.name,
      address,
      settings.currency,
      subtotal,
      discount?.code ?? null,
      discount?.amount ?? 0,
      shipping,
      total,
      now,
    ),
    env.DB.prepare(
      "INSERT INTO order_events (id, order_id, kind, detail, actor, created_at) VALUES (?, ?, 'placed', ?, NULL, ?)",
    ).bind(crypto.randomUUID(), orderId, `Placed by ${input.email}`, now),
  ];
  for (const line of lines) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO order_lines (id, order_id, product_id, variant_id, title, variant_label, sku, price, quantity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        orderId,
        line.productId,
        line.variantId,
        line.title,
        line.label,
        line.sku,
        line.price,
        line.quantity,
      ),
    );
    if (line.trackInventory) {
      // The CHECK (quantity >= 0) fails the whole batch when stock ran out.
      statements.push(
        env.DB.prepare(
          "UPDATE variants SET quantity = quantity - ? WHERE id = ? AND track_inventory = 1",
        ).bind(line.quantity, line.variantId),
        env.DB.prepare(
          `INSERT INTO inventory_adjustments (id, variant_id, delta, quantity_after, reason, actor, order_number, created_at)
           SELECT ?, id, ?, quantity, 'sold', NULL, ${orderNumber.sql}, ? FROM variants WHERE id = ?`,
        ).bind(crypto.randomUUID(), -line.quantity, ...orderNumber.params, now, line.variantId),
      );
    }
  }
  if (discount) {
    // The CHECK (usage_count <= usage_limit) fails the batch at the limit.
    statements.push(
      env.DB.prepare(
        "UPDATE discounts SET usage_count = usage_count + 1 WHERE id = ?",
      ).bind(discount.id),
    );
  }

  try {
    await env.DB.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("variants_quantity_nonnegative")) {
      throw new UserError("An item sold out while you were checking out.", 409);
    }
    if (message.includes("discounts_usage_within_limit")) {
      throw new UserError("That discount code has been used up.", 409);
    }
    if (message.includes("UNIQUE") && message.includes("orders.number")) {
      throw new UserError("The store is busy. Place the order again.", 409);
    }
    throw error;
  }

  const [order] = await db
    .select({ number: orders.number })
    .from(orders)
    .where(eq(orders.id, orderId));
  const number = order!.number;
  const statusUrl = `${origin}/s/o/${token}`;

  let redirect = statusUrl;
  if (await isReady("stripe")) {
    try {
      const session = await createCheckoutSession({
        id: orderId,
        number,
        total,
        currency: settings.currency,
        email: input.email,
        statusUrl,
        cancelUrl: statusUrl,
        storeName: settings.name,
      });
      await db
        .update(orders)
        .set({ stripeSessionId: session.id })
        .where(eq(orders.id, orderId));
      redirect = session.url;
    } catch (error) {
      console.warn("card checkout not started", error);
    }
  }

  waitUntil(
    sendOrderEmail(
      input.email,
      `${settings.name}: order #${number} confirmed`,
      [
        `Thanks for your order, ${input.name}.`,
        "",
        ...lines.map(
          (l) => `${l.quantity} × ${l.title} (${l.label}): ${formatMoney(l.price * l.quantity, settings.currency)}`,
        ),
        `Total: ${formatMoney(total, settings.currency)}`,
        "",
        `Follow your order: ${statusUrl}`,
      ].join("\n"),
    ),
  );

  return { token, number, redirect, statusUrl };
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

