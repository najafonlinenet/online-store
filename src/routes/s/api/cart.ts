import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { cartLinesInput, resolveCart } from "@/server/storefront";

// Public: the storefront's cart reads current prices and stock here.
export const Route = createFileRoute("/s/api/cart")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const parsed = z
          .object({ lines: cartLinesInput })
          .safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json({ error: "Invalid cart" }, { status: 400 });
        }
        const cart = await resolveCart(parsed.data.lines);
        return Response.json({
          store: cart.store,
          lines: cart.lines.map((line) => ({
            variantId: line.variantId,
            title: line.title,
            handle: line.handle,
            label: line.label,
            productId: line.productId,
            hasImage: line.hasImage,
            price: line.price,
            quantity: line.quantity,
            available: line.available,
          })),
        });
      },
    },
  },
});
