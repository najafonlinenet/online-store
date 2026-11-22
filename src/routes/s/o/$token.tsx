import { createFileRoute, notFound } from "@tanstack/react-router";
import { StoreNotFound, StoreShell } from "@/client/components/StoreShell";
import { Badge } from "@/client/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { formatMoney } from "@/lib/money";
import { getOrderStatus } from "@/serverFunctions/storefront";

// Public, by the order's unguessable token: the buyer's own order only.
export const Route = createFileRoute("/s/o/$token")({
  loader: async ({ params }) => {
    const order = await getOrderStatus({ data: { token: params.token } });
    if (!order) throw notFound();
    return order;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `Order #${loaderData.number} · ${loaderData.storeName}` },
          { name: "robots", content: "noindex" },
        ]
      : [],
  }),
  notFoundComponent: StoreNotFound,
  component: OrderStatus,
});

const PAYMENT = { pending: "Payment pending", paid: "Paid", refunded: "Refunded" } as const;

function OrderStatus() {
  const order = Route.useLoaderData();
  const money = (n: number) => formatMoney(n, order.currency);
  return (
    <StoreShell storeName={order.storeName}>
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Order #{order.number}</h1>
        <p className="text-muted-foreground">Thanks, {order.name}.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge
              data-testid="payment-status"
              variant={order.paymentStatus === "paid" ? "success" : order.paymentStatus === "pending" ? "warning" : "secondary"}
            >
              {PAYMENT[order.paymentStatus]}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Delivery</CardTitle>
          </CardHeader>
          <CardContent data-testid="fulfillment-status" className="text-sm">
            {order.cancelled ? (
              "Cancelled"
            ) : order.fulfillmentStatus === "fulfilled" ? (
              <>
                Shipped with {order.carrier}
                <div className="font-mono">{order.trackingNumber}</div>
              </>
            ) : (
              "Not shipped yet"
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {order.lines.map((line, index) => (
            <div key={index} className="flex justify-between gap-3">
              <div>
                <div className="font-medium">{line.title}</div>
                <div className="text-muted-foreground">
                  {line.variantLabel} · {line.quantity} × {money(line.price)}
                </div>
              </div>
              <div className="tabular-nums">{money(line.price * line.quantity)}</div>
            </div>
          ))}
          <dl className="space-y-1 border-t border-border pt-3">
            <Line label="Subtotal" value={money(order.subtotal)} testId="order-subtotal" />
            {order.discountCode ? (
              <Line
                label={`Discount (${order.discountCode})`}
                value={`−${money(order.discountAmount)}`}
                testId="order-discount"
              />
            ) : null}
            <Line
              label="Shipping"
              value={order.shipping ? money(order.shipping) : "Free"}
              testId="order-shipping"
            />
            <Line label="Total" value={money(order.total)} testId="order-total" strong />
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Ship to</CardTitle>
        </CardHeader>
        <CardContent>
          <address className="text-sm not-italic">
            {[
              order.name,
              order.address.line1,
              order.address.line2,
              [order.address.postalCode, order.address.city].filter(Boolean).join(" "),
              order.address.region,
              order.address.country,
            ]
              .filter(Boolean)
              .map((part) => (
                <div key={part}>{part}</div>
              ))}
          </address>
        </CardContent>
      </Card>
    </StoreShell>
  );
}

function Line({
  label,
  value,
  testId,
  strong,
}: {
  label: string;
  value: string;
  testId: string;
  strong?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-semibold" : ""}`}>
      <dt>{label}</dt>
      <dd data-testid={testId} className="tabular-nums">
        {value}
      </dd>
    </div>
  );
}
