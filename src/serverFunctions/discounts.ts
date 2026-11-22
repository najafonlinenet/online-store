import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as discounts from "@/server/discounts";
import { getSettings } from "@/server/settings";
import { areaMiddleware } from "./access";

const staff = areaMiddleware("products");

export const getDiscounts = createServerFn()
  .middleware([staff])
  .handler(async () => ({
    discounts: await discounts.listDiscounts(),
    currency: (await getSettings()).currency,
  }));

export const saveDiscount = createServerFn({ method: "POST" })
  .middleware([staff])
  .validator((data: unknown) => discounts.saveDiscountInput.parse(data))
  .handler(({ data }) => discounts.saveDiscount(data));

export const setDiscountEnabled = createServerFn({ method: "POST" })
  .middleware([staff])
  .validator((data: unknown) =>
    z.object({ id: z.string(), enabled: z.boolean() }).strict().parse(data),
  )
  .handler(({ data }) => discounts.setDiscountEnabled(data.id, data.enabled));

export const deleteDiscount = createServerFn({ method: "POST" })
  .middleware([staff])
  .validator((data: unknown) => discounts.discountIdInput.parse(data))
  .handler(({ data }) => discounts.deleteDiscount(data.id));
