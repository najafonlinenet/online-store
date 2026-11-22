import { createServerFn } from "@tanstack/react-start";
import * as orders from "@/server/orders";
import { UserError } from "@/server/errors";
import { setResponseStatus } from "@tanstack/react-start/server";
import { areaMiddleware } from "./access";

const staff = areaMiddleware("orders");

export const getOrders = createServerFn()
  .middleware([staff])
  .validator((data: unknown) => orders.listOrdersInput.parse(data))
  .handler(({ data }) => orders.listOrders(data));

export const getOrder = createServerFn()
  .middleware([staff])
  .validator((data: unknown) => orders.orderIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const order = await orders.getOrder(data.id);
    if (!order) throw new UserError("No such order.", 404);
    return { order, canRefund: context.member.isAdmin };
  });

export const markPaid = createServerFn({ method: "POST" })
  .middleware([staff])
  .validator((data: unknown) => orders.orderIdInput.parse(data))
  .handler(({ data, context }) => orders.markPaid(data.id, context.member.email));

export const fulfillOrder = createServerFn({ method: "POST" })
  .middleware([staff])
  .validator((data: unknown) => orders.fulfillInput.parse(data))
  .handler(({ data, context }) => orders.fulfill(data, context.member.email));

export const cancelOrder = createServerFn({ method: "POST" })
  .middleware([staff])
  .validator((data: unknown) => orders.orderIdInput.parse(data))
  .handler(({ data, context }) => orders.cancelOrder(data.id, context.member.email));

export const refundOrder = createServerFn({ method: "POST" })
  .middleware([staff])
  .validator((data: unknown) => orders.orderIdInput.parse(data))
  .handler(({ data, context }) => {
    if (!context.member.isAdmin) {
      setResponseStatus(403);
      throw new UserError("Only admins can refund orders.", 403);
    }
    return orders.refundOrder(data.id, context.member.email);
  });

export const saveOrderNotes = createServerFn({ method: "POST" })
  .middleware([staff])
  .validator((data: unknown) => orders.notesInput.parse(data))
  .handler(({ data }) => orders.setOrderNotes(data));
