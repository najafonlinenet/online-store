import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/client/components/Field";
import { PageHeader } from "@/client/components/PageHeader";
import { FulfillmentBadge, PaymentBadge } from "@/client/components/StatusBadge";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";
import { formatDateTime, messageOf } from "@/client/lib/errors";
import { formatMoney } from "@/lib/money";
import {
  cancelOrder,
  fulfillOrder,
  getOrder,
  markPaid,
  refundOrder,
  saveOrderNotes,
} from "@/serverFunctions/orders";
import { StaffError } from "../../_staff";

export const Route = createFileRoute("/_staff/orders/$id")({
  loader: ({ params }) => getOrder({ data: { id: params.id } }),
  head: ({ loaderData }) => ({
    meta: loaderData ? [{ title: `Order #${loaderData.order.number}` }] : [],
  }),
  errorComponent: StaffError,
  component: OrderPage,
});

function OrderPage() {
  const { order, canRefund } = Route.useLoaderData();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shipping, setShipping] = useState(false);
  const money = (n: number) => formatMoney(n, order.currency);
  const cancelled = Boolean(order.cancelledAt);

  async function act(work: () => Promise<unknown>, done: string) {
    setError(null);
    setBusy(true);
    try {
      await work();
      toast.success(done);
      await router.invalidate();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  const canPay = order.paymentStatus === "pending" && !cancelled;
  const canFulfill =
    order.fulfillmentStatus === "unfulfilled" && !cancelled && order.paymentStatus !== "refunded";
  const canCancel = order.fulfillmentStatus === "unfulfilled" && !cancelled;

  return (
    <>
      <PageHeader
        title={`Order #${order.number}`}
        description={
          <span data-testid="order-state" className="flex flex-wrap items-center gap-2">
            {formatDateTime(order.createdAt)}
            <PaymentBadge status={order.paymentStatus} />
            <FulfillmentBadge status={order.fulfillmentStatus} cancelled={cancelled} />
          </span>
        }
        backLink={
          <Link
            to="/orders"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden />
            Orders
          </Link>
        }
        actions={
          <>
            {canPay ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void act(() => markPaid({ data: { id: order.id } }), "Marked as paid")}
              >
                Mark as paid
              </Button>
            ) : null}
            {canFulfill ? (
              <Button disabled={busy} onClick={() => setShipping(true)}>
                Fulfill
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`Cancel order #${order.number}? Its items go back into stock.`)) return;
                  void act(() => cancelOrder({ data: { id: order.id } }), "Order cancelled");
                }}
              >
                Cancel order
              </Button>
            ) : null}
            {canRefund && order.paymentStatus === "paid" ? (
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => {
                  const how = order.paidByCard ? " The card payment is refunded in full." : "";
                  if (!window.confirm(`Refund order #${order.number}?${how}`)) return;
                  void act(() => refundOrder({ data: { id: order.id } }), "Order refunded");
                }}
              >
                Refund
              </Button>
            ) : null}
          </>
        }
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {order.lines.map((line) => (
            <div key={line.id} className="flex justify-between gap-3">
              <div>
                <div className="font-medium">{line.title}</div>
                <div className="text-xs text-muted-foreground">
                  {line.variantLabel}
                  {line.sku ? ` · ${line.sku}` : ""} · {money(line.price)} × {line.quantity}
                </div>
              </div>
              <div className="tabular-nums">{money(line.price * line.quantity)}</div>
            </div>
          ))}
          <dl className="space-y-1 border-t border-border pt-3">
            <Row label="Subtotal" value={money(order.subtotal)} />
            {order.discountCode ? (
              <Row label={`Discount (${order.discountCode})`} value={`−${money(order.discountAmount)}`} />
            ) : null}
            <Row label="Shipping" value={order.shipping ? money(order.shipping) : "Free"} />
            <Row label="Total" value={money(order.total)} strong />
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="font-medium">{order.name}</div>
            <div className="text-muted-foreground">{order.email}</div>
            <address className="pt-2 not-italic">
              {[
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
        <Card>
          <CardHeader>
            <CardTitle>Shipping</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {order.trackingNumber ? (
              <>
                <div>{order.carrier}</div>
                <div className="font-mono">{order.trackingNumber}</div>
              </>
            ) : (
              <span className="text-muted-foreground">Not shipped yet</span>
            )}
          </CardContent>
        </Card>
      </div>

      <NotesCard id={order.id} notes={order.notes} />

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ol data-testid="timeline" className="space-y-3 text-sm">
            {[...order.events].reverse().map((event) => (
              <li key={event.id} className="flex justify-between gap-3">
                <div>
                  <div>{event.detail}</div>
                  {event.actor ? (
                    <div className="text-xs text-muted-foreground">{event.actor}</div>
                  ) : null}
                </div>
                <time className="shrink-0 text-xs text-muted-foreground">
                  {formatDateTime(event.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <FulfillDialog
        open={shipping}
        onClose={() => setShipping(false)}
        onSubmit={(carrier, trackingNumber) =>
          fulfillOrder({ data: { id: order.id, carrier, trackingNumber } }).then(async () => {
            toast.success("Order fulfilled");
            setShipping(false);
            await router.invalidate();
          })
        }
      />
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-semibold" : ""}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function NotesCard({ id, notes }: { id: string; notes: string }) {
  const [text, setText] = useState(notes);
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardContent className="space-y-3">
        <Field label="Staff notes">
          <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <Button
          variant="outline"
          size="sm"
          pending={busy}
          disabled={text === notes}
          onClick={async () => {
            setBusy(true);
            try {
              await saveOrderNotes({ data: { id, notes: text } });
              toast.success("Notes saved");
            } catch (cause) {
              toast.error(messageOf(cause));
            } finally {
              setBusy(false);
            }
          }}
        >
          Save notes
        </Button>
      </CardContent>
    </Card>
  );
}

function FulfillDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (carrier: string, trackingNumber: string) => Promise<void>;
}) {
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fulfill order</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await onSubmit(carrier, tracking);
            } catch (cause) {
              setError(messageOf(cause));
            } finally {
              setBusy(false);
            }
          }}
        >
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Field label="Carrier">
            <Input value={carrier} required onChange={(e) => setCarrier(e.target.value)} />
          </Field>
          <Field label="Tracking number">
            <Input value={tracking} required onChange={(e) => setTracking(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" pending={busy}>
              Mark as fulfilled
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
