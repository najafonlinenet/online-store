// The app's tools for AI clients, served by the Gateway at /mcp. Each one
// checks the same permission areas as the pages.
import { ToolError, defineTools, type EveryAppUser } from "@every-app/sdk/server";
import { assertArea, ensureMember, type Area } from "@/server/access";
import { UserError } from "@/server/errors";
import * as inventory from "@/server/inventory";
import * as orders from "@/server/orders";

async function allow(user: EveryAppUser, area: Area) {
  try {
    assertArea(await ensureMember(user), area);
  } catch (error) {
    if (error instanceof UserError) throw new ToolError(error.message);
    throw error;
  }
}

export const tools = defineTools({
  list_orders: {
    description:
      "List the store's orders, newest first, 25 per page. Filter by payment (pending, paid, refunded) or fulfillment (unfulfilled, fulfilled, cancelled), or search by order number or email.",
    risk: "read",
    input: orders.listOrdersInput,
    handler: async (input, { user }) => {
      await allow(user, "orders");
      return orders.listOrders(input);
    },
  },
  list_inventory: {
    description:
      "List variants that track stock, with SKU and quantity. filter: low (at or below the low-stock threshold) or out (sold out).",
    risk: "read",
    input: inventory.listInventoryInput,
    handler: async (input, { user }) => {
      await allow(user, "products");
      return inventory.listInventory(input);
    },
  },
});
