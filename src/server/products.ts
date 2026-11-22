import { and, asc, count, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { db } from "@/db";
import {
  collections,
  orderLines,
  productCollections,
  products,
  variants,
} from "@/db/schema";
import { slugify } from "@/lib/money";
import { UserError } from "./errors";

const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, digits and dashes");

const variantInput = z
  .object({
    id: z.string().optional(),
    label: z.string().trim().min(1, "Every variant needs a label").max(80),
    sku: z.string().trim().max(64),
    price: z.number().int().min(0, "Price can't be negative"),
    compareAtPrice: z.number().int().nullable(),
    trackInventory: z.boolean(),
    quantity: z.number().int().min(0, "Stock can't be negative"),
  })
  .strict()
  .refine((v) => v.compareAtPrice === null || v.compareAtPrice > v.price, {
    message: "Compare-at price must be higher than the price",
  });

export const saveProductInput = z
  .object({
    id: z.string().optional(),
    title: z.string().trim().min(1, "Give the product a title").max(200),
    handle: z.union([handleSchema, z.literal("")]),
    description: z.string().max(5000),
    status: z.enum(["draft", "active", "archived"]),
    collectionIds: z.array(z.string()).max(100),
    variants: z.array(variantInput).min(1, "Add at least one variant").max(50),
  })
  .strict();

export const listProductsInput = z
  .object({
    q: z.string().max(200).optional(),
    status: z.enum(["all", "draft", "active", "archived"]).optional(),
    sort: z.enum(["updated", "title", "created"]).optional(),
    page: z.number().int().min(1).optional(),
  })
  .strict();

const PAGE_SIZE = 20;

export async function listProducts(input: z.infer<typeof listProductsInput>) {
  const filters = [];
  if (input.q) {
    const pattern = `%${input.q}%`;
    filters.push(or(like(products.title, pattern), like(products.handle, pattern)));
  }
  if (input.status && input.status !== "all") {
    filters.push(eq(products.status, input.status));
  }
  const where = filters.length ? and(...filters) : undefined;
  const order =
    input.sort === "title"
      ? asc(products.title)
      : input.sort === "created"
        ? desc(products.createdAt)
        : desc(products.updatedAt);
  const page = input.page ?? 1;
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: products.id,
        title: products.title,
        handle: products.handle,
        status: products.status,
        imageKey: products.imageKey,
        variantCount: sql<number>`(select count(*) from variants v where v.product_id = "products"."id")`,
        stock: sql<number | null>`(select sum(v.quantity) from variants v where v.product_id = ${products.id} and v.track_inventory = 1)`,
        minPrice: sql<number>`(select min(v.price) from variants v where v.product_id = "products"."id")`,
      })
      .from(products)
      .where(where)
      .orderBy(order, asc(products.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(products).where(where),
  ]);
  return { rows, total: total?.n ?? 0, page, pageSize: PAGE_SIZE };
}

export async function getProduct(id: string) {
  const [product] = await db.select().from(products).where(eq(products.id, id));
  if (!product) return null;
  const [variantRows, collectionRows, ordered] = await Promise.all([
    db
      .select()
      .from(variants)
      .where(eq(variants.productId, id))
      .orderBy(asc(variants.position)),
    db
      .select({ collectionId: productCollections.collectionId })
      .from(productCollections)
      .where(eq(productCollections.productId, id)),
    db
      .select({ n: count() })
      .from(orderLines)
      .where(eq(orderLines.productId, id)),
  ]);
  return {
    ...product,
    variants: variantRows,
    collectionIds: collectionRows.map((row) => row.collectionId),
    hasOrders: (ordered[0]?.n ?? 0) > 0,
  };
}

async function uniqueHandle(wanted: string, exceptId?: string): Promise<string> {
  const base = wanted || "product";
  for (let n = 1; n < 100; n++) {
    const handle = n === 1 ? base : `${base}-${n}`;
    const [taken] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.handle, handle));
    if (!taken || taken.id === exceptId) return handle;
  }
  throw new UserError("Pick another handle.");
}

/** Creates or updates a product with its variants and collections. */
export async function saveProduct(
  input: z.infer<typeof saveProductInput>,
  actor: string,
): Promise<{ id: string }> {
  const id = input.id ?? crypto.randomUUID();
  const existing = input.id ? await getProduct(input.id) : null;
  if (input.id && !existing) throw new UserError("No such product.", 404);

  let handle: string;
  if (input.handle) {
    const [taken] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.handle, input.handle));
    if (taken && taken.id !== id) {
      throw new UserError("Another product already uses that handle.", 409);
    }
    handle = input.handle;
  } else {
    handle = await uniqueHandle(slugify(input.title), id);
  }

  const knownVariantIds = new Set(existing?.variants.map((v) => v.id));
  for (const v of input.variants) {
    if (v.id && !knownVariantIds.has(v.id)) {
      throw new UserError("A variant doesn't belong to this product.");
    }
  }
  if (input.collectionIds.length) {
    const found = await db
      .select({ id: collections.id })
      .from(collections)
      .where(inArray(collections.id, input.collectionIds));
    if (found.length !== new Set(input.collectionIds).size) {
      throw new UserError("A collection no longer exists.");
    }
  }

  const keptIds = new Set(input.variants.flatMap((v) => (v.id ? [v.id] : [])));
  const removed = existing?.variants.filter((v) => !keptIds.has(v.id)) ?? [];
  const now = new Date().toISOString();
  const statements = [];
  if (existing) {
    statements.push(
      env.DB.prepare(
        "UPDATE products SET title = ?, handle = ?, description = ?, status = ?, updated_at = ? WHERE id = ?",
      ).bind(input.title, handle, input.description, input.status, now, id),
    );
  } else {
    statements.push(
      env.DB.prepare(
        "INSERT INTO products (id, title, handle, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(id, input.title, handle, input.description, input.status, now, now),
    );
  }
  for (const v of removed) {
    statements.push(env.DB.prepare("DELETE FROM variants WHERE id = ?").bind(v.id));
  }
  input.variants.forEach((v, position) => {
    const before = existing?.variants.find((old) => old.id === v.id);
    if (before) {
      statements.push(
        env.DB.prepare(
          "UPDATE variants SET position = ?, label = ?, sku = ?, price = ?, compare_at_price = ?, track_inventory = ?, quantity = ? WHERE id = ?",
        ).bind(
          position,
          v.label,
          v.sku,
          v.price,
          v.compareAtPrice,
          v.trackInventory ? 1 : 0,
          v.quantity,
          before.id,
        ),
      );
      const delta = v.quantity - before.quantity;
      if (delta !== 0 && v.trackInventory) {
        statements.push(adjustmentRow(before.id, delta, "correction", actor));
      }
    } else {
      const variantId = crypto.randomUUID();
      statements.push(
        env.DB.prepare(
          "INSERT INTO variants (id, product_id, position, label, sku, price, compare_at_price, track_inventory, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(
          variantId,
          id,
          position,
          v.label,
          v.sku,
          v.price,
          v.compareAtPrice,
          v.trackInventory ? 1 : 0,
          v.quantity,
        ),
      );
      if (v.trackInventory && v.quantity > 0) {
        statements.push(adjustmentRow(variantId, v.quantity, "received", actor));
      }
    }
  });
  statements.push(
    env.DB.prepare("DELETE FROM product_collections WHERE product_id = ?").bind(id),
  );
  for (const collectionId of new Set(input.collectionIds)) {
    statements.push(
      env.DB.prepare(
        "INSERT INTO product_collections (product_id, collection_id) VALUES (?, ?)",
      ).bind(id, collectionId),
    );
  }
  await env.DB.batch(statements);
  return { id };
}

/** An adjustment row reading the variant's quantity after the change. */
export function adjustmentRow(
  variantId: string,
  delta: number,
  reason: string,
  actor: string | null,
  orderNumberSql?: { sql: string; params: unknown[] },
) {
  const order = orderNumberSql ?? { sql: "NULL", params: [] };
  return env.DB.prepare(
    `INSERT INTO inventory_adjustments (id, variant_id, delta, quantity_after, reason, actor, order_number, created_at)
     SELECT ?, id, ?, quantity, ?, ?, ${order.sql}, ? FROM variants WHERE id = ?`,
  ).bind(
    crypto.randomUUID(),
    delta,
    reason,
    actor,
    ...order.params,
    new Date().toISOString(),
    variantId,
  );
}

export const productIdInput = z.object({ id: z.string().min(1) }).strict();

export async function setProductStatus(id: string, status: "draft" | "active" | "archived") {
  const [row] = await db
    .update(products)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(products.id, id))
    .returning({ id: products.id });
  if (!row) throw new UserError("No such product.", 404);
}

export async function deleteProduct(id: string) {
  const product = await getProduct(id);
  if (!product) throw new UserError("No such product.", 404);
  if (product.hasOrders) {
    throw new UserError(
      "This product has orders, so it can't be deleted. Archive it instead.",
      409,
    );
  }
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM inventory_adjustments WHERE variant_id IN (SELECT id FROM variants WHERE product_id = ?)",
    ).bind(id),
    env.DB.prepare("DELETE FROM product_collections WHERE product_id = ?").bind(id),
    env.DB.prepare("DELETE FROM variants WHERE product_id = ?").bind(id),
    env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id),
  ]);
  if (product.imageKey) await env.files.delete(product.imageKey);
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function setProductImage(id: string, file: File) {
  if (!IMAGE_TYPES.includes(file.type)) {
    throw new UserError("Use a PNG, JPEG, WebP or GIF image.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new UserError("Images can be up to 5 MB.");
  }
  const [product] = await db
    .select({ imageKey: products.imageKey })
    .from(products)
    .where(eq(products.id, id));
  if (!product) throw new UserError("No such product.", 404);
  const key = `products/${id}/${crypto.randomUUID()}`;
  await env.files.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });
  await db
    .update(products)
    .set({ imageKey: key, updatedAt: new Date().toISOString() })
    .where(eq(products.id, id));
  if (product.imageKey) await env.files.delete(product.imageKey);
}

/** The image of a product, when it may be shown to this caller. */
export async function readProductImage(id: string, member: boolean) {
  const [product] = await db
    .select({ imageKey: products.imageKey, status: products.status })
    .from(products)
    .where(eq(products.id, id));
  if (!product?.imageKey) return null;
  if (!member && product.status !== "active") return null;
  return env.files.get(product.imageKey);
}

// Collections

export const saveCollectionInput = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(1, "Give the collection a name").max(80),
    handle: z.union([handleSchema, z.literal("")]),
  })
  .strict();

export function listCollections() {
  return db
    .select({
      id: collections.id,
      name: collections.name,
      handle: collections.handle,
      productCount: sql<number>`(select count(*) from product_collections pc where pc.collection_id = "collections"."id")`,
    })
    .from(collections)
    .orderBy(asc(collections.name));
}

export async function saveCollection(input: z.infer<typeof saveCollectionInput>) {
  const handle = input.handle || slugify(input.name) || "collection";
  const [taken] = await db
    .select({ id: collections.id })
    .from(collections)
    .where(eq(collections.handle, handle));
  if (taken && taken.id !== input.id) {
    throw new UserError("Another collection already uses that handle.", 409);
  }
  if (input.id) {
    const [row] = await db
      .update(collections)
      .set({ name: input.name, handle })
      .where(eq(collections.id, input.id))
      .returning({ id: collections.id });
    if (!row) throw new UserError("No such collection.", 404);
    return row;
  }
  const [row] = await db
    .insert(collections)
    .values({ id: crypto.randomUUID(), name: input.name, handle })
    .returning({ id: collections.id });
  return row!;
}

export async function deleteCollection(id: string) {
  await db.delete(collections).where(eq(collections.id, id));
}
