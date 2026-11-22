import { createServerFn } from "@tanstack/react-start";
import * as customers from "@/server/customers";
import { UserError } from "@/server/errors";
import { orderIdInput } from "@/server/orders";
import { areaMiddleware } from "./access";

const staff = areaMiddleware("customers");

export const getCustomers = createServerFn()
  .middleware([staff])
  .validator((data: unknown) => customers.listCustomersInput.parse(data))
  .handler(({ data }) => customers.listCustomers(data));

export const getCustomer = createServerFn()
  .middleware([staff])
  .validator((data: unknown) => orderIdInput.parse(data))
  .handler(async ({ data }) => {
    const customer = await customers.getCustomer(data.id);
    if (!customer) throw new UserError("No such customer.", 404);
    return customer;
  });

export const createCustomer = createServerFn({ method: "POST" })
  .middleware([staff])
  .validator((data: unknown) => customers.createCustomerInput.parse(data))
  .handler(({ data }) => customers.createCustomer(data));

export const updateCustomer = createServerFn({ method: "POST" })
  .middleware([staff])
  .validator((data: unknown) => customers.updateCustomerInput.parse(data))
  .handler(({ data }) => customers.updateCustomer(data));
