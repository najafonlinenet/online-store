import { and, asc, desc, eq, like, lte, or } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { db } from "@/db";
import { inventoryAdjustments, products, variants } from "@/db/schema";
import { UserError } from "./errors";
import { getSettings } from "./settings";

export const listInventoryInput = z
  .object({
    q: z.string().max(200).optional(),
    filter: z.enum(["all", "low", "out"]).optional(),
  })
  .strict();

export async function listInventory(input: z.infer<typeof listInventoryInput>) {
  const settings = await getSettings();
  const filters = [eq(variants.trackInventory, true)];
  if (input.q) {
    const pattern = `%${input.q}%`;
    filters.push(or(like(products.title, pattern), like(variants.sku, pattern))!);
  }
  if (input.filter === "low") filters.push(lte(variants.quantity, settings.lowStockThreshold));
  if (input.filter === "out") filters.push(eq(variants.quantity, 0));
  const rows = await db
    .select({
      variantId: variants.id,
      productId: products.id,
      title: products.title,
      label: variants.label,
      sku: variants.sku,
      quantity: variants.quantity,
      status: products.status,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .where(and(...filters))
    .orderBy(asc(products.title), asc(variants.position))
    .limit(500);
  return { rows, lowStockThreshold: settings.lowStockThreshold };
}

export const adjustInput = z
  .object({
    variantId: z.string().min(1),
    mode: z.enum(["add", "set"]),
    amount: z.number().int().min(-1000000).max(1000000),
    reason: z.enum(["received", "correction", "damaged"]),
  })
  .strict();

export async function adjustStock(input: z.infer<typeof adjustInput>, actor: string) {
  const [variant] = await db
    .select({ trackInventory: variants.trackInventory })
    .from(variants)
    .where(eq(variants.id, input.variantId));
  if (!variant) throw new UserError("No such variant.", 404);
  if (!variant.trackInventory) {
    throw new UserError("This variant doesn't track stock.");
  }
  if (input.mode === "set" && input.amount < 0) {
    throw new UserError("Stock can't go below zero.");
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const statements =
    input.mode === "add"
      ? [
          env.DB.prepare(
            "UPDATE variants SET quantity = quantity + ? WHERE id = ?",
          ).bind(input.amount, input.variantId),
          env.DB.prepare(
            `INSERT INTO inventory_adjustments (id, variant_id, delta, quantity_after, reason, actor, created_at)
             SELECT ?, id, ?, quantity, ?, ?, ? FROM variants WHERE id = ?`,
          ).bind(id, input.amount, input.reason, actor, now, input.variantId),
        ]
      : [
          env.DB.prepare(
            `INSERT INTO inventory_adjustments (id, variant_id, delta, quantity_after, reason, actor, created_at)
             SELECT ?, id, ? - quantity, ?, ?, ?, ? FROM variants WHERE id = ?`,
          ).bind(id, input.amount, input.amount, input.reason, actor, now, input.variantId),
          env.DB.prepare("UPDATE variants SET quantity = ? WHERE id = ?").bind(
            input.amount,
            input.variantId,
          ),
        ];
  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (String(error).includes("variants_quantity_nonnegative")) {
      throw new UserError("Stock can't go below zero.");
    }
    throw error;
  }
}

export const historyInput = z.object({ variantId: z.string().min(1) }).strict();

export async function variantHistory(variantId: string) {
  const [variant] = await db
    .select({
      label: variants.label,
      sku: variants.sku,
      quantity: variants.quantity,
      title: products.title,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .where(eq(variants.id, variantId));
  if (!variant) throw new UserError("No such variant.", 404);
  const rows = await db
    .select({
      id: inventoryAdjustments.id,
      delta: inventoryAdjustments.delta,
      quantityAfter: inventoryAdjustments.quantityAfter,
      reason: inventoryAdjustments.reason,
      actor: inventoryAdjustments.actor,
      orderNumber: inventoryAdjustments.orderNumber,
      createdAt: inventoryAdjustments.createdAt,
    })
    .from(inventoryAdjustments)
    .where(eq(inventoryAdjustments.variantId, variantId))
    .orderBy(desc(inventoryAdjustments.createdAt), desc(inventoryAdjustments.id))
    .limit(200);
  return { variant, rows };
}
