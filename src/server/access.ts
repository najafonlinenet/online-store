import { isAdmin, type EveryAppUser } from "@every-app/sdk/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { members } from "@/db/schema";
import { UserError } from "./errors";

export type Area = "products" | "orders" | "customers";
export const AREAS: Area[] = ["products", "orders", "customers"];

export interface Member {
  userId: string;
  email: string;
  isAdmin: boolean;
  areas: Area[];
}

/** The member's row, made on first sight with products and orders. */
export async function ensureMember(user: EveryAppUser): Promise<Member> {
  await db
    .insert(members)
    .values({
      userId: user.id,
      email: user.email,
      canProducts: true,
      canOrders: true,
      canCustomers: false,
    })
    .onConflictDoNothing();
  const [row] = await db
    .select()
    .from(members)
    .where(eq(members.userId, user.id));
  if (row && row.email !== user.email) {
    await db
      .update(members)
      .set({ email: user.email })
      .where(eq(members.userId, user.id));
  }
  const admin = isAdmin(user);
  const areas: Area[] = admin
    ? [...AREAS]
    : AREAS.filter((area) => row && areaFlag(row, area));
  return { userId: user.id, email: user.email, isAdmin: admin, areas };
}

function areaFlag(row: typeof members.$inferSelect, area: Area): boolean {
  if (area === "products") return row.canProducts;
  if (area === "orders") return row.canOrders;
  return row.canCustomers;
}

export function assertArea(member: Member, area: Area | "admin"): void {
  const allowed =
    area === "admin" ? member.isAdmin : member.areas.includes(area);
  if (!allowed) {
    throw new UserError("You don't have access to this part of the store.", 403);
  }
}

export function listMembers() {
  return db
    .select({
      userId: members.userId,
      email: members.email,
      canProducts: members.canProducts,
      canOrders: members.canOrders,
      canCustomers: members.canCustomers,
    })
    .from(members)
    .orderBy(asc(members.email));
}

export const setPermissionsInput = z
  .object({
    userId: z.string().min(1),
    canProducts: z.boolean(),
    canOrders: z.boolean(),
    canCustomers: z.boolean(),
  })
  .strict();

export async function setPermissions(input: z.infer<typeof setPermissionsInput>) {
  const { userId, ...flags } = input;
  const [row] = await db
    .update(members)
    .set(flags)
    .where(eq(members.userId, userId))
    .returning({ userId: members.userId });
  if (!row) throw new UserError("No such member.", 404);
}
