import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/client/components/Field";
import { PageHeader } from "@/client/components/PageHeader";
import { FulfillmentBadge, PaymentBadge } from "@/client/components/StatusBadge";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";
import { formatDate, messageOf } from "@/client/lib/errors";
import { formatMoney } from "@/lib/money";
import { getCustomer, updateCustomer } from "@/serverFunctions/customers";
import { getStoreCurrency } from "@/serverFunctions/staff";
import { StaffError } from "../../_staff";

export const Route = createFileRoute("/_staff/customers/$id")({
  loader: async ({ params }) => {
    const [customer, currency] = await Promise.all([
      getCustomer({ data: { id: params.id } }),
      getStoreCurrency(),
    ]);
    return { customer, currency };
  },
  head: ({ loaderData }) => ({
    meta: loaderData ? [{ title: loaderData.customer.name || loaderData.customer.email }] : [],
  }),
  errorComponent: StaffError,
  component: CustomerPage,
});

function CustomerPage() {
  const { customer, currency } = Route.useLoaderData();
  const router = useRouter();
  const [name, setName] = useState(customer.name);
  const [notes, setNotes] = useState(customer.notes);
  const [busy, setBusy] = useState(false);
  const address = customer.address;

  return (
    <>
      <PageHeader
        title={customer.name || customer.email}
        description={`${customer.email} · ${customer.orderCount} orders · ${formatMoney(customer.totalSpent, currency)} spent`}
        backLink={
          <Link
            to="/customers"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden />
            Customers
          </Link>
        }
      />
      <Card>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await updateCustomer({ data: { id: customer.id, name, notes } });
                toast.success("Customer saved");
                await router.invalidate();
              } catch (cause) {
                toast.error(messageOf(cause));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Notes">
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <Button type="submit" pending={busy}>
              Save customer
            </Button>
          </form>
        </CardContent>
      </Card>
      {address ? (
        <Card>
          <CardHeader>
            <CardTitle>Default address</CardTitle>
          </CardHeader>
          <CardContent>
            <address className="text-sm not-italic">
              {[
                address.line1,
                address.line2,
                [address.postalCode, address.city].filter(Boolean).join(" "),
                address.region,
                address.country,
              ]
                .filter(Boolean)
                .map((part) => (
                  <div key={part}>{part}</div>
                ))}
            </address>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Orders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {customer.orders.length === 0 ? (
            <p className="text-muted-foreground">No orders yet.</p>
          ) : (
            customer.orders.map((order) => (
              <div key={order.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Link
                    to="/orders/$id"
                    params={{ id: order.id }}
                    className="font-medium hover:underline"
                  >
                    #{order.number}
                  </Link>
                  <span className="text-muted-foreground">{formatDate(order.createdAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <PaymentBadge status={order.paymentStatus} />
                  <FulfillmentBadge
                    status={order.fulfillmentStatus}
                    cancelled={Boolean(order.cancelledAt)}
                  />
                  <span className="tabular-nums">{formatMoney(order.total, order.currency)}</span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}
