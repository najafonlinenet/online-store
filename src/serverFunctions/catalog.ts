import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as products from "@/server/products";
import { getSettings } from "@/server/settings";
import { UserError } from "@/server/errors";
import { areaMiddleware } from "./access";

const staff = areaMiddleware("products");

export const getProducts = createServerFn()
  .middleware([staff])
  .validator((data: unknown) => products.listProductsInput.parse(data))
  .handler(async ({ data }) => ({
    ...(await products.listProducts(data)),
    currency: (await getSettings()).currency,
  }));

export const getProductForm = createServerFn()
  .middleware([staff])
  .validator((data: unknown) => z.object({ id: z.string().nullable() }).parse(data))
  .handler(async ({ data }) => {
    const [product, collections, store] = await Promise.all([
      data.id ? products.getProduct(data.id) : null,
      products.listCollections(),
      getSettings(),
    ]);
    if (data.id && !product) throw new UserError("No such product.", 404);
    return { product, collections, currency: store.currency };
  });

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([staff])
  .validator((data: unknown) => products.saveProductInput.parse(data))
  .handler(({ data, context }) => products.saveProduct(data, context.member.email));

export const setProductStatus = createServerFn({ method: "POST" })
  .middleware([staff])
  .validator((data: unknown) =>
    z
      .object({ id: z.string(), status: z.enum(["draft", "active", "archived"]) })
      .strict()
      .parse(data),
  )
  .handler(({ data }) => products.setProductStatus(data.id, data.status));

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([staff])
  .validator((data: unknown) => products.productIdInput.parse(data))
  .handler(({ data }) => products.deleteProduct(data.id));

export const uploadProductImage = createServerFn({ method: "POST" })
  .middleware([staff])
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new UserError("Send the image as a form.");
    const id = data.get("id");
    const file = data.get("file");
    if (typeof id !== "string" || !(file instanceof File)) {
      throw new UserError("Choose an image.");
    }
    return { id, file };
  })
  .handler(({ data }) => products.setProductImage(data.id, data.file));

export const getCollections = createServerFn()
  .middleware([staff])
  .handler(() => products.listCollections());

export const saveCollection = createServerFn({ method: "POST" })
  .middleware([staff])
  .validator((data: unknown) => products.saveCollectionInput.parse(data))
  .handler(({ data }) => products.saveCollection(data));

export const deleteCollection = createServerFn({ method: "POST" })
  .middleware([staff])
  .validator((data: unknown) => products.productIdInput.parse(data))
  .handler(({ data }) => products.deleteCollection(data.id));
