import { and, asc, count, desc, eq, isNotNull, isNull, like } from "drizzle-orm";
import { env, waitUntil } from "cloudflare:workers";
import { z } from "zod";
import { db } from "@/db";
import { orderEvents, orderLines, orders } from "@/db/schema";
import { UserError } from "./errors";
import {
  readCheckoutSession,
  refundPayment,
  sendOrderEmail,
} from "./integrations";
import { getSettings } from "./settings";

export const listOrdersInput = z
  .object({
    q: z.string().max(200).optional(),
    payment: z.enum(["all", "pending", "paid", "refunded"]).optional(),
    fulfillment: z.enum(["all", "unfulfilled", "fulfilled", "cancelled"]).optional(),
    page: z.number().int().min(1).optional(),
  })
  .strict();

const PAGE_SIZE = 25;

export async function listOrders(input: z.infer<typeof listOrdersInput>) {
  const filters = [];
  if (input.q) {
    const q = input.q.trim().replace(/^#/, "");
    filters.push(
      /^\d+$/.test(q)
        ? eq(orders.number, Number(q))
        : like(orders.email, `%${q.toLowerCase()}%`),
    );
  }
  if (input.payment && input.payment !== "all") {
    filters.push(eq(orders.paymentStatus, input.payment));
  }
  if (input.fulfillment === "cancelled") filters.push(isNotNull(orders.cancelledAt));
  else if (input.fulfillment && input.fulfillment !== "all") {
    filters.push(eq(orders.fulfillmentStatus, input.fulfillment), isNull(orders.cancelledAt));
  }
  const where = filters.length ? and(...filters) : undefined;
  const page = input.page ?? 1;
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: orders.id,
        number: orders.number,
        createdAt: orders.createdAt,
        name: orders.name,
        email: orders.email,
        total: orders.total,
        currency: orders.currency,
        paymentStatus: orders.paymentStatus,
        fulfillmentStatus: orders.fulfillmentStatus,
        cancelledAt: orders.cancelledAt,
      })
      .from(orders)
      .where(where)
      .orderBy(desc(orders.number))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(orders).where(where),
  ]);
  return { rows, total: total?.n ?? 0, page, pageSize: PAGE_SIZE };
}

export async function getOrder(id: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order) return null;
  const [lines, events] = await Promise.all([
    db.select().from(orderLines).where(eq(orderLines.orderId, id)),
    db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, id))
      .orderBy(asc(orderEvents.createdAt), asc(orderEvents.id)),
  ]);
  const { token: _token, stripeSessionId: _session, ...shown } = order;
  return {
    ...shown,
    paidByCard: Boolean(order.stripePaymentIntent),
    address: JSON.parse(order.address) as Record<string, string>,
    lines,
    events,
  };
}

/** A buyer's own order by its token: nothing a buyer shouldn't see. */
export async function getOrderByToken(token: string) {
  const [order] = await db.select().from(orders).where(eq(orders.token, token));
  if (!order) return null;
  let current = order;
  if (order.paymentStatus === "pending" && order.stripeSessionId && !order.cancelledAt) {
    current = (await confirmCardPayment(order)) ?? order;
  }
  const lines = await db
    .select({
      title: orderLines.title,
      variantLabel: orderLines.variantLabel,
      price: orderLines.price,
      quantity: orderLines.quantity,
    })
    .from(orderLines)
    .where(eq(orderLines.orderId, order.id));
  const settings = await getSettings();
  return {
    storeName: settings.name,
    number: current.number,
    createdAt: current.createdAt,
    name: current.name,
    email: current.email,
    address: JSON.parse(current.address) as Record<string, string>,
    currency: current.currency,
    subtotal: current.subtotal,
    discountCode: current.discountCode,
    discountAmount: current.discountAmount,
    shipping: current.shipping,
    total: current.total,
    paymentStatus: current.paymentStatus,
    fulfillmentStatus: current.fulfillmentStatus,
    cancelled: Boolean(current.cancelledAt),
    carrier: current.carrier,
    trackingNumber: current.trackingNumber,
    lines,
  };
}

/** Asks the card service whether the order's session was paid; marks it paid when it was. */
async function confirmCardPayment(order: typeof orders.$inferSelect) {
  try {
    const session = await readCheckoutSession(order.stripeSessionId!);
    if (!session.paid || session.amountTotal !== order.total || session.orderId !== order.id) {
      return null;
    }
    await transition(order.id, {
      kind: "paid",
      detail: "Paid by card",
      actor: null,
      when: "payment_status = 'pending' AND cancelled_at IS NULL",
      set: "payment_status = 'paid', stripe_payment_intent = ?",
      setParams: [session.paymentIntent],
      spent: 1,
    });
    const [fresh] = await db.select().from(orders).where(eq(orders.id, order.id));
    return fresh ?? null;
  } catch (error) {
    console.warn("card payment not confirmed", error);
    return null;
  }
}

/**
 * One guarded change: the event row is written only when the order is in
 * the state `when` names, and every other statement runs only if it was.
 * One batch, so either all of it happens or none.
 */
async function transition(
  orderId: string,
  change: {
    kind: string;
    detail: string;
    actor: string | null;
    when: string;
    set?: string;
    setParams?: unknown[];
    spent?: 1 | -1;
    restock?: boolean;
  },
): Promise<boolean> {
  const eventId = crypto.randomUUID();
  const now = new Date().toISOString();
  const happened = "EXISTS (SELECT 1 FROM order_events WHERE id = ?)";
  const statements = [
    env.DB.prepare(
      `INSERT INTO order_events (id, order_id, kind, detail, actor, created_at)
       SELECT ?, id, ?, ?, ?, ? FROM orders WHERE id = ? AND ${change.when}`,
    ).bind(eventId, change.kind, change.detail, change.actor, now, orderId),
  ];
  if (change.spent) {
    statements.push(
      env.DB.prepare(
        `UPDATE customers SET total_spent = MAX(0, total_spent + ? * (SELECT total FROM orders WHERE id = ?))
         WHERE id = (SELECT customer_id FROM orders WHERE id = ?) AND ${happened}`,
      ).bind(change.spent, orderId, orderId, eventId),
    );
  }
  if (change.restock) {
    const lines = await db
      .select({ variantId: orderLines.variantId, quantity: orderLines.quantity })
      .from(orderLines)
      .where(eq(orderLines.orderId, orderId));
    for (const line of lines) {
      if (!line.variantId) continue;
      statements.push(
        env.DB.prepare(
          `UPDATE variants SET quantity = quantity + ? WHERE id = ? AND track_inventory = 1 AND ${happened}`,
        ).bind(line.quantity, line.variantId, eventId),
        env.DB.prepare(
          `INSERT INTO inventory_adjustments (id, variant_id, delta, quantity_after, reason, actor, order_number, created_at)
           SELECT ?, id, ?, quantity, 'restocked', ?, (SELECT number FROM orders WHERE id = ?), ?
           FROM variants WHERE id = ? AND track_inventory = 1 AND ${happened}`,
        ).bind(
          crypto.randomUUID(),
          line.quantity,
          change.actor,
          orderId,
          now,
          line.variantId,
          eventId,
        ),
      );
    }
  }
  if (change.set) {
    statements.push(
      env.DB.prepare(`UPDATE orders SET ${change.set} WHERE id = ? AND ${happened}`).bind(
        ...(change.setParams ?? []),
        orderId,
        eventId,
      ),
    );
  }
  const [first] = await env.DB.batch(statements);
  return (first?.meta.changes ?? 0) > 0;
}

async function requireOrder(id: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order) throw new UserError("No such order.", 404);
  return order;
}

export const orderIdInput = z.object({ id: z.string().min(1) }).strict();

export async function markPaid(id: string, actor: string) {
  await requireOrder(id);
  const done = await transition(id, {
    kind: "paid",
    detail: "Marked as paid",
    actor,
    when: "payment_status = 'pending' AND cancelled_at IS NULL",
    set: "payment_status = 'paid'",
    spent: 1,
  });
  if (!done) throw new UserError("Only a pending order can be marked as paid.", 409);
}

export const fulfillInput = z
  .object({
    id: z.string().min(1),
    carrier: z.string().trim().min(1, "Enter the carrier").max(80),
    trackingNumber: z.string().trim().min(1, "Enter the tracking number").max(120),
  })
  .strict();

export async function fulfill(input: z.infer<typeof fulfillInput>, actor: string) {
  const order = await requireOrder(input.id);
  const done = await transition(input.id, {
    kind: "fulfilled",
    detail: `Shipped with ${input.carrier}, tracking ${input.trackingNumber}`,
    actor,
    when: "fulfillment_status = 'unfulfilled' AND cancelled_at IS NULL AND payment_status IN ('pending', 'paid')",
    set: "fulfillment_status = 'fulfilled', carrier = ?, tracking_number = ?",
    setParams: [input.carrier, input.trackingNumber],
  });
  if (!done) {
    throw new UserError("This order can't be fulfilled: it's already fulfilled, cancelled or refunded.", 409);
  }
  const settings = await getSettings();
  waitUntil(
    sendOrderEmail(
      order.email,
      `${settings.name}: order #${order.number} has shipped`,
      `Your order #${order.number} is on its way with ${input.carrier}.\nTracking number: ${input.trackingNumber}`,
    ),
  );
}

export async function cancelOrder(id: string, actor: string) {
  await requireOrder(id);
  const done = await transition(id, {
    kind: "cancelled",
    detail: "Cancelled and restocked",
    actor,
    when: "fulfillment_status = 'unfulfilled' AND cancelled_at IS NULL",
    set: "cancelled_at = ?",
    setParams: [new Date().toISOString()],
    restock: true,
  });
  if (!done) throw new UserError("Only an unfulfilled order can be cancelled.", 409);
}

export async function refundOrder(id: string, actor: string) {
  const order = await requireOrder(id);
  if (order.paymentStatus !== "paid") {
    throw new UserError("Only a paid order can be refunded.", 409);
  }
  if (order.stripePaymentIntent) {
    await refundPayment(order.stripePaymentIntent).catch(() => {
      throw new UserError("The card refund didn't go through. Try again later.", 502);
    });
  }
  const done = await transition(id, {
    kind: "refunded",
    detail: order.stripePaymentIntent ? "Refunded to the card" : "Marked as refunded",
    actor,
    when: "payment_status = 'paid'",
    set: "payment_status = 'refunded'",
    spent: -1,
  });
  if (!done) throw new UserError("Only a paid order can be refunded.", 409);
}

export const notesInput = z
  .object({ id: z.string().min(1), notes: z.string().max(5000) })
  .strict();

export async function setOrderNotes(input: z.infer<typeof notesInput>) {
  const [row] = await db
    .update(orders)
    .set({ notes: input.notes })
    .where(eq(orders.id, input.id))
    .returning({ id: orders.id });
  if (!row) throw new UserError("No such order.", 404);
}

