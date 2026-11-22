import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, count, eq, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { orders, variants } from "@/db/schema";
import * as access from "@/server/access";
import { isReady } from "@/server/integrations";
import * as settings from "@/server/settings";
import { areaMiddleware } from "./access";

export const getMe = createServerFn()
  .middleware([areaMiddleware(null)])
  .handler(({ context: { member } }) => member);

export const getOverview = createServerFn()
  .middleware([areaMiddleware(null)])
  .handler(async ({ context: { member } }) => {
    const store = await settings.getSettings();
    const [toShip] = member.areas.includes("orders")
      ? await db
          .select({ n: count() })
          .from(orders)
          .where(
            and(
              eq(orders.fulfillmentStatus, "unfulfilled"),
              isNull(orders.cancelledAt),
            ),
          )
      : [null];
    const [low] = member.areas.includes("products")
      ? await db
          .select({ n: count() })
          .from(variants)
          .where(
            and(
              eq(variants.trackInventory, true),
              lte(variants.quantity, store.lowStockThreshold),
            ),
          )
      : [null];
    return {
      member,
      store: { name: store.name, open: store.storefrontOpen },
      storeUrl: `${new URL(getRequest().url).origin}/s`,
      toShip: toShip?.n ?? null,
      lowStock: low?.n ?? null,
    };
  });

export const getSettingsPage = createServerFn()
  .middleware([areaMiddleware("admin")])
  .handler(async ({ context: { member } }) => {
    const [store, people, payments, email] = await Promise.all([
      settings.getSettings(),
      access.listMembers(),
      isReady("stripe"),
      isReady("email"),
    ]);
    return { store, members: people, me: member.userId, payments, email };
  });

export const saveSettings = createServerFn({ method: "POST" })
  .middleware([areaMiddleware("admin")])
  .validator((data: unknown) => settings.updateSettingsInput.parse(data))
  .handler(({ data }) => settings.updateSettings(data));

export const savePermissions = createServerFn({ method: "POST" })
  .middleware([areaMiddleware("admin")])
  .validator((data: unknown) => access.setPermissionsInput.parse(data))
  .handler(({ data }) => access.setPermissions(data));

export const getStoreCurrency = createServerFn()
  .middleware([areaMiddleware(null)])
  .handler(async () => (await settings.getSettings()).currency);
