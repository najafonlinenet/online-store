import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { storeSettings } from "@/db/schema";
import { CURRENCIES } from "@/lib/money";

export type StoreSettings = Omit<typeof storeSettings.$inferSelect, "id">;

const DEFAULTS: StoreSettings = {
  name: "My Store",
  currency: "USD",
  shippingRate: 500,
  freeShippingThreshold: null,
  lowStockThreshold: 5,
  storefrontOpen: true,
};

export async function getSettings(): Promise<StoreSettings> {
  const [row] = await db
    .select()
    .from(storeSettings)
    .where(eq(storeSettings.id, "store"));
  if (!row) return DEFAULTS;
  const { id: _id, ...settings } = row;
  return settings;
}

export const updateSettingsInput = z
  .object({
    name: z.string().trim().min(1, "Give the store a name").max(80),
    currency: z.enum(Object.keys(CURRENCIES) as [keyof typeof CURRENCIES]),
    shippingRate: z.number().int().min(0),
    freeShippingThreshold: z.number().int().min(0).nullable(),
    lowStockThreshold: z.number().int().min(0).max(100000),
    storefrontOpen: z.boolean(),
  })
  .strict();

export async function updateSettings(
  input: z.infer<typeof updateSettingsInput>,
): Promise<StoreSettings> {
  await db
    .insert(storeSettings)
    .values({ id: "store", ...input })
    .onConflictDoUpdate({ target: storeSettings.id, set: input });
  return getSettings();
}
