import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/client/components/EmptyState";
import { CheckField, Field } from "@/client/components/Field";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
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
import { formatDate, messageOf } from "@/client/lib/errors";
import { formatMoney, parseMoney, toAmountInput } from "@/lib/money";
import {
  deleteDiscount,
  getDiscounts,
  saveDiscount,
  setDiscountEnabled,
} from "@/serverFunctions/discounts";
import { StaffError } from "../_staff";

export const Route = createFileRoute("/_staff/discounts")({
  loader: () => getDiscounts(),
  head: () => ({ meta: [{ title: "Discounts" }] }),
  errorComponent: StaffError,
  component: Discounts,
});

type Discount = Awaited<ReturnType<typeof getDiscounts>>["discounts"][number];

const STATUS = {
  active: { label: "Active", variant: "success" },
  scheduled: { label: "Scheduled", variant: "info" },
  expired: { label: "Expired", variant: "secondary" },
  disabled: { label: "Disabled", variant: "outline" },
  "used up": { label: "Used up", variant: "secondary" },
} as const;

function Discounts() {
  const { discounts, currency } = Route.useLoaderData();
  const router = useRouter();
  const [editing, setEditing] = useState<Discount | "new" | null>(null);

  async function act(work: () => Promise<unknown>, done: string) {
    try {
      await work();
      toast.success(done);
      await router.invalidate();
    } catch (cause) {
      toast.error(messageOf(cause));
    }
  }

  return (
    <>
      <PageHeader
        title="Discounts"
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus aria-hidden />
            New code
          </Button>
        }
      />
      {discounts.length === 0 ? (
        <EmptyState
          title="No discount codes yet"
          description="Create one and buyers can enter it at checkout."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Uses</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {discounts.map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  <div className="font-mono font-medium">{d.code}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.kind === "percentage" ? `${d.value}% off` : `${formatMoney(d.value, currency)} off`}
                    {d.minSubtotal !== null ? ` · over ${formatMoney(d.minSubtotal, currency)}` : ""}
                    {d.startsAt ? ` · from ${formatDate(d.startsAt)}` : ""}
                    {d.endsAt ? ` · until ${formatDate(d.endsAt)}` : ""}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS[d.status].variant}>{STATUS[d.status].label}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {d.usageCount}
                  {d.usageLimit !== null ? ` / ${d.usageLimit}` : ""}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
                      Actions
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditing(d)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          void act(
                            () => setDiscountEnabled({ data: { id: d.id, enabled: !d.enabled } }),
                            d.enabled ? "Code disabled" : "Code enabled",
                          )
                        }
                      >
                        {d.enabled ? "Disable" : "Enable"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          if (!window.confirm(`Delete ${d.code}?`)) return;
                          void act(() => deleteDiscount({ data: { id: d.id } }), "Code deleted");
                        }}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {editing ? (
        <DiscountDialog
          discount={editing === "new" ? null : editing}
          currency={currency}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function DiscountDialog({
  discount,
  currency,
  onClose,
}: {
  discount: Discount | null;
  currency: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState(discount?.code ?? "");
  const [kind, setKind] = useState<"percentage" | "fixed">(discount?.kind ?? "percentage");
  const [value, setValue] = useState(
    discount ? (discount.kind === "fixed" ? toAmountInput(discount.value, currency) : String(discount.value)) : "",
  );
  const [minimum, setMinimum] = useState(toAmountInput(discount?.minSubtotal ?? null, currency));
  const [limit, setLimit] = useState(discount?.usageLimit ? String(discount.usageLimit) : "");
  const [startsAt, setStartsAt] = useState(toDateInput(discount?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toDateInput(discount?.endsAt ?? null));
  const [enabled, setEnabled] = useState(discount?.enabled ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    const amount = kind === "fixed" ? parseMoney(value, currency) : Number(value);
    if (amount === null || !Number.isInteger(amount)) {
      setError(kind === "fixed" ? "Enter an amount, such as 5.00." : "Enter a whole percentage.");
      return;
    }
    const minSubtotal = minimum.trim() ? parseMoney(minimum, currency) : null;
    if (minimum.trim() && minSubtotal === null) {
      setError("Enter the minimum as an amount, such as 50.00.");
      return;
    }
    setBusy(true);
    try {
      await saveDiscount({
        data: {
          ...(discount ? { id: discount.id } : {}),
          code,
          kind,
          value: amount,
          minSubtotal,
          usageLimit: limit.trim() ? Number(limit) : null,
          startsAt: startsAt ? new Date(`${startsAt}T00:00:00`).toISOString() : null,
          endsAt: endsAt ? new Date(`${endsAt}T23:59:59`).toISOString() : null,
          enabled,
        },
      });
      toast.success("Code saved");
      await router.invalidate();
      onClose();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{discount ? `Edit ${discount.code}` : "New discount code"}</DialogTitle>
        </DialogHeader>
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
          <Field label="Code">
            <Input
              value={code}
              required
              className="font-mono uppercase"
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type">
              <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as "fixed")}>
                <NativeSelectOption value="percentage">Percentage</NativeSelectOption>
                <NativeSelectOption value="fixed">Fixed amount</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field label="Amount" hint={kind === "percentage" ? "%, 1 to 100" : currency}>
              <Input inputMode="decimal" required value={value} onChange={(e) => setValue(e.target.value)} />
            </Field>
            <Field label="Minimum subtotal" hint={currency}>
              <Input inputMode="decimal" value={minimum} onChange={(e) => setMinimum(e.target.value)} />
            </Field>
            <Field label="Usage limit">
              <Input type="number" min={1} value={limit} onChange={(e) => setLimit(e.target.value)} />
            </Field>
            <Field label="Starts">
              <Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </Field>
            <Field label="Ends">
              <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </Field>
          </div>
          <CheckField label="Enabled" checked={enabled} onChange={setEnabled} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" pending={busy}>
              Save code
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
