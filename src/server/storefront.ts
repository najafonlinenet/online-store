import { and, asc, eq, inArray, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { collections, productCollections, products, variants } from "@/db/schema";
import { getSettings } from "./settings";

// Everything here is public: only active products, and only what a buyer
// sees. No costs, customers or orders.

export const storefrontInput = z
  .object({
    q: z.string().max(200).optional(),
    collection: z.string().max(80).optional(),
  })
  .strict();

export async function getStorefront(input: z.infer<typeof storefrontInput>) {
  const settings = await getSettings();
  const store = {
    name: settings.name,
    currency: settings.currency,
    open: settings.storefrontOpen,
  };
  if (!settings.storefrontOpen) return { store, collections: [], products: [] };
  const filters = [eq(products.status, "active")];
  if (input.q) {
    const pattern = `%${input.q}%`;
    filters.push(
      or(like(products.title, pattern), like(products.description, pattern))!,
    );
  }
  if (input.collection) {
    filters.push(
      sql`${products.id} in (select pc.product_id from product_collections pc join collections c on c.id = pc.collection_id where c.handle = ${input.collection})`,
    );
  }
  const [collectionRows, productRows] = await Promise.all([
    db
      .selectDistinct({ name: collections.name, handle: collections.handle })
      .from(collections)
      .innerJoin(productCollections, eq(productCollections.collectionId, collections.id))
      .innerJoin(products, eq(products.id, productCollections.productId))
      .where(eq(products.status, "active"))
      .orderBy(asc(collections.name)),
    db
      .select({
        id: products.id,
        title: products.title,
        handle: products.handle,
        hasImage: sql<number>`${products.imageKey} is not null`,
      })
      .from(products)
      .where(and(...filters))
      .orderBy(asc(products.title))
      .limit(200),
  ]);
  const variantRows = productRows.length
    ? await db
        .select({
          productId: variants.productId,
          price: variants.price,
          compareAtPrice: variants.compareAtPrice,
          trackInventory: variants.trackInventory,
          quantity: variants.quantity,
        })
        .from(variants)
        .where(inArray(variants.productId, productRows.map((p) => p.id)))
        .orderBy(asc(variants.position))
    : [];
  return {
    store,
    collections: collectionRows,
    products: productRows.map((p) => {
      const own = variantRows.filter((v) => v.productId === p.id);
      const cheapest = own.reduce<(typeof own)[number] | undefined>(
        (best, v) => (!best || v.price < best.price ? v : best),
        undefined,
      );
      return {
        id: p.id,
        title: p.title,
        handle: p.handle,
        hasImage: Boolean(p.hasImage),
        price: cheapest?.price ?? 0,
        compareAtPrice: cheapest?.compareAtPrice ?? null,
        soldOut: own.every((v) => v.trackInventory && v.quantity <= 0),
      };
    }),
  };
}

export async function getStorefrontProduct(handle: string) {
  const settings = await getSettings();
  const store = {
    name: settings.name,
    currency: settings.currency,
    open: settings.storefrontOpen,
  };
  if (!settings.storefrontOpen) return { store, product: null };
  const [product] = await db
    .select({
      id: products.id,
      title: products.title,
      handle: products.handle,
      description: products.description,
      hasImage: sql<number>`${products.imageKey} is not null`,
    })
    .from(products)
    .where(and(eq(products.handle, handle), eq(products.status, "active")));
  if (!product) return { store, product: null };
  const variantRows = await db
    .select({
      id: variants.id,
      label: variants.label,
      price: variants.price,
      compareAtPrice: variants.compareAtPrice,
      trackInventory: variants.trackInventory,
      quantity: variants.quantity,
    })
    .from(variants)
    .where(eq(variants.productId, product.id))
    .orderBy(asc(variants.position));
  return {
    store,
    product: {
      ...product,
      hasImage: Boolean(product.hasImage),
      variants: variantRows.map(publicVariant),
    },
  };
}

/** A variant as a buyer sees it: stock only as a cap, never as a count of the store's. */
function publicVariant(v: {
  id: string;
  label: string;
  price: number;
  compareAtPrice: number | null;
  trackInventory: boolean;
  quantity: number;
}) {
  return {
    id: v.id,
    label: v.label,
    price: v.price,
    compareAtPrice: v.compareAtPrice,
    available: v.trackInventory ? v.quantity : null,
  };
}

export const cartLinesInput = z
  .array(
    z
      .object({
        variantId: z.string().min(1).max(64),
        quantity: z.number().int().min(1).max(999),
      })
      .strict(),
  )
  .max(100);

/** The cart's lines as they stand now: inactive products dropped, quantity capped. */
export async function resolveCart(lines: z.infer<typeof cartLinesInput>) {
  const settings = await getSettings();
  const ids = [...new Set(lines.map((line) => line.variantId))];
  const rows = ids.length
    ? await db
        .select({
          variantId: variants.id,
          label: variants.label,
          sku: variants.sku,
          price: variants.price,
          trackInventory: variants.trackInventory,
          quantity: variants.quantity,
          productId: products.id,
          title: products.title,
          handle: products.handle,
          hasImage: sql<number>`${products.imageKey} is not null`,
        })
        .from(variants)
        .innerJoin(products, eq(products.id, variants.productId))
        .where(and(inArray(variants.id, ids), eq(products.status, "active")))
    : [];
  const resolved: {
    variantId: string;
    productId: string;
    title: string;
    handle: string;
    label: string;
    sku: string;
    hasImage: boolean;
    price: number;
    quantity: number;
    requested: number;
    available: number | null;
    trackInventory: boolean;
  }[] = [];
  for (const line of lines) {
    const row = rows.find((r) => r.variantId === line.variantId);
    if (!row) continue;
    if (resolved.some((r) => r.variantId === row.variantId)) continue;
    const available = row.trackInventory ? row.quantity : null;
    const quantity = available === null ? line.quantity : Math.min(line.quantity, available);
    if (quantity <= 0) continue;
    resolved.push({
      variantId: row.variantId,
      productId: row.productId,
      title: row.title,
      handle: row.handle,
      label: row.label,
      sku: row.sku,
      hasImage: Boolean(row.hasImage),
      price: row.price,
      quantity,
      requested: line.quantity,
      available,
      trackInventory: row.trackInventory,
    });
  }
  return {
    store: {
      name: settings.name,
      currency: settings.currency,
      open: settings.storefrontOpen,
    },
    lines: resolved,
  };
}
