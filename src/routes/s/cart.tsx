import { createFileRoute } from "@tanstack/react-router";
import { ImageIcon, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Field } from "@/client/components/Field";
import { StoreShell } from "@/client/components/StoreShell";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Spinner } from "@/client/components/ui/spinner";
import { useCart, writeCart, type CartLine } from "@/client/lib/cart";
import { formatMoney } from "@/lib/money";

// The cart lives in this browser, so the page renders there.
export const Route = createFileRoute("/s/cart")({
  ssr: false,
  head: () => ({ meta: [{ title: "Cart" }] }),
  component: CartPage,
});

interface Resolved {
  store: { name: string; currency: string; open: boolean };
  lines: {
    variantId: string;
    productId: string;
    title: string;
    handle: string;
    label: string;
    hasImage: boolean;
    price: number;
    quantity: number;
    available: number | null;
  }[];
}

async function resolve(lines: CartLine[]): Promise<Resolved> {
  const response = await fetch("/s/api/cart", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lines }),
  });
  if (!response.ok) throw new Error("The cart couldn't be loaded.");
  return (await response.json()) as Resolved;
}

function CartPage() {
  const cart = useCart();
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    resolve(cart)
      .then((answer) => {
        if (!current) return;
        setResolved(answer);
        // Drop what's no longer for sale and cap quantities at stock.
        const kept = answer.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }));
        if (JSON.stringify(kept) !== JSON.stringify(cart)) writeCart(kept);
      })
      .catch((cause: Error) => current && setLoadError(cause.message));
    return () => {
      current = false;
    };
  }, [cart]);

  if (!resolved) {
    return (
      <StoreShell storeName="">
        {loadError ? (
          <Alert variant="destructive">
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}
      </StoreShell>
    );
  }

  const { store, lines } = resolved;
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
  const money = (n: number) => formatMoney(n, store.currency);

  function setQuantity(variantId: string, quantity: number) {
    writeCart(
      cart
        .map((l) => (l.variantId === variantId ? { ...l, quantity } : l))
        .filter((l) => l.quantity > 0),
    );
  }

  return (
    <StoreShell storeName={store.name}>
      <h1 className="text-3xl font-semibold tracking-tight">Cart</h1>
      {lines.length === 0 ? (
        <div className="space-y-3 py-8">
          <p className="text-muted-foreground">Your cart is empty.</p>
          <Button variant="outline" render={<a href="/s" />}>
            Keep shopping
          </Button>
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-[1fr_22rem]">
          <div className="space-y-4">
            {lines.map((line) => (
              <div
                key={line.variantId}
                data-testid="cart-line"
                className="flex items-center gap-4 border-b border-border pb-4"
              >
                <a
                  href={`/s/p/${line.handle}`}
                  className="size-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted"
                >
                  {line.hasImage ? (
                    <img src={`/s/img/${line.productId}`} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-muted-foreground">
                      <ImageIcon className="size-5" aria-hidden />
                    </span>
                  )}
                </a>
                <div className="min-w-0 flex-1">
                  <a href={`/s/p/${line.handle}`} className="font-medium hover:underline">
                    {line.title}
                  </a>
                  <div className="text-sm text-muted-foreground">
                    {line.label} · {money(line.price)}
                  </div>
                </div>
                <Field label="Quantity" className="w-20 space-y-1">
                  <Input
                    type="number"
                    min={1}
                    max={line.available ?? undefined}
                    value={line.quantity}
                    onChange={(e) => {
                      const next = Math.floor(Number(e.target.value));
                      if (next >= 1) setQuantity(line.variantId, next);
                    }}
                  />
                </Field>
                <div className="w-20 text-right tabular-nums">{money(line.price * line.quantity)}</div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${line.title}`}
                  onClick={() => setQuantity(line.variantId, 0)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
            <div className="flex justify-between text-lg font-semibold">
              <span>Subtotal</span>
              <span data-testid="cart-subtotal" className="tabular-nums">
                {money(subtotal)}
              </span>
            </div>
          </div>
          {store.open ? (
            <CheckoutForm lines={lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }))} />
          ) : (
            <p data-testid="store-closed" className="text-muted-foreground">
              The store is closed right now, so checkout is paused.
            </p>
          )}
        </div>
      )}
    </StoreShell>
  );
}

function CheckoutForm({ lines }: { lines: CartLine[] }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/s/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: text("email"),
          name: text("name"),
          address: {
            line1: text("line1"),
            line2: text("line2"),
            city: text("city"),
            region: text("region"),
            postalCode: text("postalCode"),
            country: text("country"),
          },
          ...(text("code") ? { code: text("code") } : {}),
          lines,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        redirect?: string;
      };
      if (!response.ok || !body.redirect) {
        setError(body.error ?? "The order couldn't be placed. Try again.");
        setBusy(false);
        return;
      }
      writeCart([]);
      window.location.assign(body.redirect);
    } catch {
      setError("The order couldn't be placed. Try again.");
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Checkout</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(e.currentTarget);
          }}
        >
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Full name">
            <Input name="name" autoComplete="name" required />
          </Field>
          <Field label="Address">
            <Input name="line1" autoComplete="address-line1" required />
          </Field>
          <Field label="Apartment, suite (optional)">
            <Input name="line2" autoComplete="address-line2" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City">
              <Input name="city" autoComplete="address-level2" required />
            </Field>
            <Field label="Postal code">
              <Input name="postalCode" autoComplete="postal-code" required />
            </Field>
            <Field label="State or region">
              <Input name="region" autoComplete="address-level1" />
            </Field>
            <Field label="Country">
              <Input name="country" autoComplete="country-name" required />
            </Field>
          </div>
          <Field label="Discount code">
            <Input name="code" className="uppercase" />
          </Field>
          <Button type="submit" className="w-full" pending={busy}>
            Place order
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
