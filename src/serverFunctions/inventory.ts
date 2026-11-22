import { createServerFn } from "@tanstack/react-start";
import * as inventory from "@/server/inventory";
import { areaMiddleware } from "./access";

const staff = areaMiddleware("products");

export const getInventory = createServerFn()
  .middleware([staff])
  .validator((data: unknown) => inventory.listInventoryInput.parse(data))
  .handler(({ data }) => inventory.listInventory(data));

export const adjustStock = createServerFn({ method: "POST" })
  .middleware([staff])
  .validator((data: unknown) => inventory.adjustInput.parse(data))
  .handler(({ data, context }) => inventory.adjustStock(data, context.member.email));

export const getVariantHistory = createServerFn()
  .middleware([staff])
  .validator((data: unknown) => inventory.historyInput.parse(data))
  .handler(({ data }) => inventory.variantHistory(data.variantId));
