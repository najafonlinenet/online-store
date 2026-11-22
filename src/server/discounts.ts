import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { discounts } from "@/db/schema";
import { discountStatus } from "./discountRules";
import { UserError } from "./errors";

export const saveDiscountInput = z
  .object({
    id: z.string().optional(),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(2, "Codes are at least 2 characters")
      .max(40)
      .regex(/^[A-Z0-9_-]+$/, "Use letters, digits, dashes and underscores"),
    kind: z.enum(["percentage", "fixed"]),
    value: z.number().int().min(1, "Enter an amount"),
    minSubtotal: z.number().int().min(0).nullable(),
    usageLimit: z.number().int().min(1).nullable(),
    startsAt: z.string().datetime().nullable(),
    endsAt: z.string().datetime().nullable(),
    enabled: z.boolean(),
  })
  .strict()
  .refine((d) => d.kind !== "percentage" || d.value <= 100, {
    message: "A percentage is 1 to 100",
  })
  .refine((d) => !d.startsAt || !d.endsAt || d.endsAt > d.startsAt, {
    message: "The end date must be after the start date",
  });

export async function listDiscounts() {
  const rows = await db.select().from(discounts).orderBy(desc(discounts.createdAt));
  const now = new Date();
  return rows.map((row) => ({ ...row, status: discountStatus(row, now) }));
}

export async function saveDiscount(input: z.infer<typeof saveDiscountInput>) {
  const [taken] = await db
    .select({ id: discounts.id })
    .from(discounts)
    .where(eq(discounts.code, input.code));
  if (taken && taken.id !== input.id) {
    throw new UserError("Another discount already uses that code.", 409);
  }
  const { id, ...values } = input;
  if (id) {
    const [current] = await db.select().from(discounts).where(eq(discounts.id, id));
    if (!current) throw new UserError("No such discount.", 404);
    if (values.usageLimit !== null && values.usageLimit < current.usageCount) {
      throw new UserError(`It has been used ${current.usageCount} times already.`);
    }
    await db.update(discounts).set(values).where(eq(discounts.id, id));
    return { id };
  }
  const [row] = await db
    .insert(discounts)
    .values({ id: crypto.randomUUID(), ...values })
    .returning({ id: discounts.id });
  return row!;
}

export const discountIdInput = z.object({ id: z.string().min(1) }).strict();

export async function setDiscountEnabled(id: string, enabled: boolean) {
  const [row] = await db
    .update(discounts)
    .set({ enabled })
    .where(eq(discounts.id, id))
    .returning({ id: discounts.id });
  if (!row) throw new UserError("No such discount.", 404);
}

export async function deleteDiscount(id: string) {
  await db.delete(discounts).where(eq(discounts.id, id));
}
