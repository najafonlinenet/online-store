import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { CheckField, Field } from "@/client/components/Field";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Input } from "@/client/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { messageOf } from "@/client/lib/errors";
import { CURRENCIES, parseMoney, toAmountInput, type Currency } from "@/lib/money";
import {
  getSettingsPage,
  savePermissions,
  saveSettings,
} from "@/serverFunctions/staff";
import { StaffError } from "../_staff";

export const Route = createFileRoute("/_staff/settings")({
  loader: () => getSettingsPage(),
  head: () => ({ meta: [{ title: "Settings" }] }),
  errorComponent: StaffError,
  component: Settings,
});

function Settings() {
  const { store, members, me, payments, email } = Route.useLoaderData();
  return (
    <>
      <PageHeader title="Settings" />
      <StoreForm key={JSON.stringify(store)} store={store} />
      <Card>
        <CardHeader>
          <CardTitle>Staff</CardTitle>
          <CardDescription>
            Everyone who has opened this app. Admins can do everything.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Products</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Customers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <MemberRow key={m.userId} member={m} isMe={m.userId === me} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Connected services</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Integration
            testId="integration-payments"
            name="Card payments"
            ready={payments}
            off="Orders are placed as payment pending."
          />
          <Integration
            testId="integration-email"
            name="Order email"
            ready={email}
            off="Buyers get no confirmation or shipping email."
          />
        </CardContent>
      </Card>
    </>
  );
}

function Integration({
  testId,
  name,
  ready,
  off,
}: {
  testId: string;
  name: string;
  ready: boolean;
  off: string;
}) {
  return (
    <div data-testid={testId} className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <div className="font-medium">{name}</div>
        {ready ? null : <div className="text-muted-foreground">{off}</div>}
      </div>
      {ready ? <Badge variant="success">Ready</Badge> : <Badge variant="outline">Not set up</Badge>}
    </div>
  );
}

type Store = Awaited<ReturnType<typeof getSettingsPage>>["store"];

function StoreForm({ store }: { store: Store }) {
  const router = useRouter();
  const [name, setName] = useState(store.name);
  const [currency, setCurrency] = useState<Currency>(store.currency as Currency);
  const [rate, setRate] = useState(toAmountInput(store.shippingRate, store.currency));
  const [threshold, setThreshold] = useState(toAmountInput(store.freeShippingThreshold, store.currency));
  const [lowStock, setLowStock] = useState(String(store.lowStockThreshold));
  const [open, setOpen] = useState(store.storefrontOpen);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    const shippingRate = parseMoney(rate || "0", currency);
    const freeShippingThreshold = threshold.trim() ? parseMoney(threshold, currency) : null;
    const lowStockThreshold = Number(lowStock);
    if (shippingRate === null || (threshold.trim() && freeShippingThreshold === null)) {
      setError("Enter amounts such as 5.00.");
      return;
    }
    if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) {
      setError("Low stock is a whole number, 0 or more.");
      return;
    }
    setBusy(true);
    try {
      await saveSettings({
        data: {
          name,
          currency,
          shippingRate,
          freeShippingThreshold,
          lowStockThreshold,
          storefrontOpen: open,
        },
      });
      toast.success("Settings saved");
      await router.invalidate();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Store</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Store name">
              <Input value={name} required onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Currency">
              <NativeSelect value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
                {Object.keys(CURRENCIES).map((code) => (
                  <NativeSelectOption key={code} value={code}>
                    {code}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Flat shipping rate" hint={currency}>
              <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
            </Field>
            <Field label="Free shipping from" hint={`${currency}, after discounts. Blank for never.`}>
              <Input inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            </Field>
            <Field label="Low stock at" hint="Units or fewer">
              <Input type="number" min={0} value={lowStock} onChange={(e) => setLowStock(e.target.value)} />
            </Field>
          </div>
          {currency !== store.currency ? (
            <p className="text-sm text-muted-foreground">
              Existing prices keep their numbers in the new currency.
            </p>
          ) : null}
          <CheckField label="Storefront open" checked={open} onChange={setOpen} />
          <Button type="submit" pending={busy}>
            Save settings
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

type MemberData = Awaited<ReturnType<typeof getSettingsPage>>["members"][number];

function MemberRow({ member, isMe }: { member: MemberData; isMe: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const flags = {
    canProducts: member.canProducts,
    canOrders: member.canOrders,
    canCustomers: member.canCustomers,
  };

  async function toggle(key: keyof typeof flags, value: boolean) {
    setBusy(true);
    try {
      await savePermissions({ data: { userId: member.userId, ...flags, [key]: value } });
      toast.success("Permissions saved");
      await router.invalidate();
    } catch (cause) {
      toast.error(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  const box = (key: keyof typeof flags, label: string) => (
    <TableCell>
      <Checkbox
        aria-label={label}
        checked={isMe ? true : flags[key]}
        disabled={busy || isMe}
        onCheckedChange={(checked) => void toggle(key, checked)}
      />
    </TableCell>
  );

  return (
    <TableRow data-testid="member-row">
      <TableCell>
        {member.email}
        {isMe ? <span className="text-muted-foreground"> (you)</span> : null}
      </TableCell>
      {box("canProducts", "Products")}
      {box("canOrders", "Orders")}
      {box("canCustomers", "Customers")}
    </TableRow>
  );
}
