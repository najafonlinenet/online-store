import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as storefront from "@/server/storefront";
import { getOrderByToken } from "@/server/orders";

// Public reads for the storefront's pages. They run while the page renders
// on the server (the store's links are full page loads), so a buyer with no
// account never calls them over HTTP.

export const getStorefront = createServerFn()
  .validator((data: unknown) => storefront.storefrontInput.parse(data))
  .handler(({ data }) => storefront.getStorefront(data));

export const getStorefrontProduct = createServerFn()
  .validator((data: unknown) => z.object({ handle: z.string().max(80) }).parse(data))
  .handler(({ data }) => storefront.getStorefrontProduct(data.handle));

export const getOrderStatus = createServerFn()
  .validator((data: unknown) => z.object({ token: z.string().max(100) }).parse(data))
  .handler(({ data }) => getOrderByToken(data.token));
