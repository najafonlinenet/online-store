import { asc, count, desc, eq, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customers, orders } from "@/db/schema";
import { addressSchema } from "./checkout";
import { UserError } from "./errors";

export const listCustomersInput = z
  .object({
    q: z.string().max(200).optional(),
    sort: z.enum(["spent", "last", "name"]).optional(),
    page: z.number().int().min(1).optional(),
  })
  .strict();

const PAGE_SIZE = 25;

export async function listCustomers(input: z.infer<typeof listCustomersInput>) {
  const where = input.q
    ? or(like(customers.email, `%${input.q.toLowerCase()}%`), like(customers.name, `%${input.q}%`))
    : undefined;
  const order =
    input.sort === "name"
      ? asc(customers.name)
      : input.sort === "last"
        ? sql`${customers.lastOrderAt} is null, ${customers.lastOrderAt} desc`
        : desc(customers.totalSpent);
  const page = input.page ?? 1;
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: customers.id,
        name: customers.name,
        email: customers.email,
        orderCount: customers.orderCount,
        totalSpent: customers.totalSpent,
        lastOrderAt: customers.lastOrderAt,
      })
      .from(customers)
      .where(where)
      .orderBy(order, asc(customers.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(customers).where(where),
  ]);
  return { rows, total: total?.n ?? 0, page, pageSize: PAGE_SIZE };
}

export async function getCustomer(id: string) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, id));
  if (!customer) return null;
  const orderRows = await db
    .select({
      id: orders.id,
      number: orders.number,
      createdAt: orders.createdAt,
      total: orders.total,
      currency: orders.currency,
      paymentStatus: orders.paymentStatus,
      fulfillmentStatus: orders.fulfillmentStatus,
      cancelledAt: orders.cancelledAt,
    })
    .from(orders)
    .where(eq(orders.customerId, id))
    .orderBy(desc(orders.number));
  return {
    ...customer,
    address: customer.address
      ? (JSON.parse(customer.address) as Record<string, string>)
      : null,
    orders: orderRows,
  };
}

export const createCustomerInput = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter a valid email"),
    name: z.string().trim().max(120),
    notes: z.string().max(5000).optional().default(""),
    address: addressSchema.optional(),
  })
  .strict();

export async function createCustomer(input: z.infer<typeof createCustomerInput>) {
  const [taken] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.email, input.email));
  if (taken) throw new UserError("A customer with that email already exists.", 409);
  const [row] = await db
    .insert(customers)
    .values({
      id: crypto.randomUUID(),
      email: input.email,
      name: input.name,
      notes: input.notes,
      address: input.address ? JSON.stringify(input.address) : null,
    })
    .returning({ id: customers.id });
  return row!;
}

export const updateCustomerInput = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().max(120),
    notes: z.string().max(5000),
  })
  .strict();

export async function updateCustomer(input: z.infer<typeof updateCustomerInput>) {
  const [row] = await db
    .update(customers)
    .set({ name: input.name, notes: input.notes })
    .where(eq(customers.id, input.id))
    .returning({ id: customers.id });
  if (!row) throw new UserError("No such customer.", 404);
}
