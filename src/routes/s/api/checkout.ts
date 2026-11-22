import { createFileRoute } from "@tanstack/react-router";
import { checkoutInput, placeOrder } from "@/server/checkout";
import { UserError } from "@/server/errors";

// Public: a buyer with no account places an order. Everything is re-read
// on the server; the answer is only where to go next.
export const Route = createFileRoute("/s/api/checkout")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const parsed = checkoutInput.safeParse(
          await request.json().catch(() => null),
        );
        if (!parsed.success) {
          const message = parsed.error.issues[0]?.message ?? "Check the form";
          return Response.json({ error: message }, { status: 400 });
        }
        try {
          const order = await placeOrder(
            parsed.data,
            new URL(request.url).origin,
          );
          return Response.json(
            { token: order.token, number: order.number, redirect: order.redirect },
            { status: 201 },
          );
        } catch (error) {
          if (error instanceof UserError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          throw error;
        }
      },
    },
  },
});
