import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { EmptyState } from "@/client/components/EmptyState";
import { Field } from "@/client/components/Field";
import { PageHeader } from "@/client/components/PageHeader";
import { SearchInput } from "@/client/components/SearchInput";
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
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { formatDateTime, messageOf } from "@/client/lib/errors";
import {
  adjustStock,
  getInventory,
  getVariantHistory,
} from "@/serverFunctions/inventory";
import { StaffError } from "../_staff";

const search = z.object({
  q: z.string().optional().catch(undefined),
  filter: z.enum(["all", "low", "out"]).optional().catch(undefined),
});

export const Route = createFileRoute("/_staff/inventory")({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getInventory({ data: deps }),
  head: () => ({ meta: [{ title: "Inventory" }] }),
  errorComponent: StaffError,
  component: Inventory,
});

type Row = Awaited<ReturnType<typeof getInventory>>["rows"][number];
type History = Awaited<ReturnType<typeof getVariantHistory>>;

const REASONS = { received: "Received", correction: "Correction", damaged: "Damaged" } as const;
const REASON_LABELS: Record<string, string> = {
  ...REASONS,
  sold: "Sold",
  restocked: "Restocked",
};

function Inventory() {
  const { rows, lowStockThreshold } = Route.useLoaderData();
  const filters = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [adjusting, setAdjusting] = useState<Row | null>(null);
  const [history, setHistory] = useState<History | null>(null);

  async function openHistory(row: Row) {
    try {
      setHistory(await getVariantHistory({ data: { variantId: row.variantId } }));
    } catch (cause) {
      toast.error(messageOf(cause));
    }
  }

  return (
    <>
      <PageHeader title="Inventory" />
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={filters.q ?? ""}
          placeholder="Search by product or SKU"
          onSearch={(q) => navigate({ search: (prev) => ({ ...prev, q: q || undefined }), replace: true })}
        />
        <div className="flex items-center gap-2">
          <Label htmlFor="inventory-filter">Show</Label>
          <NativeSelect
            id="inventory-filter"
            value={filters.filter ?? "all"}
            onChange={(e) =>
              navigate({
                search: (prev) => ({ ...prev, filter: e.target.value as "all" }),
                replace: true,
              })
            }
          >
            <NativeSelectOption value="all">All tracked</NativeSelectOption>
            <NativeSelectOption value="low">Low stock (≤ {lowStockThreshold})</NativeSelectOption>
            <NativeSelectOption value="out">Sold out</NativeSelectOption>
          </NativeSelect>
        </div>
      </div>
      {rows.length === 0 ? (
        filters.q || (filters.filter ?? "all") !== "all" ? (
          <EmptyState kind="filtered" title="Nothing matches" />
        ) : (
          <EmptyState
            title="No tracked stock yet"
            description="Variants that track stock appear here."
          />
        )
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Variant</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.variantId} data-testid="inventory-row">
                <TableCell>
                  <div className="font-medium">{row.title}</div>
                  <div className="text-xs text-muted-foreground">{row.label}</div>
                </TableCell>
                <TableCell className="text-muted-foreground">{row.sku || "—"}</TableCell>
                <TableCell className="text-right">
                  <span className="inline-flex items-center gap-2">
                    {row.quantity === 0 ? (
                      <Badge variant="destructive">Sold out</Badge>
                    ) : row.quantity <= lowStockThreshold ? (
                      <Badge variant="warning">Low</Badge>
                    ) : null}
                    <span data-testid="quantity" className="tabular-nums">
                      {row.quantity}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button variant="ghost" size="sm" onClick={() => void openHistory(row)}>
                    History
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setAdjusting(row)}>
                    Adjust
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <AdjustDialog row={adjusting} onClose={() => setAdjusting(null)} />
      <Dialog open={history !== null} onOpenChange={(open) => !open && setHistory(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {history ? `${history.variant.title} · ${history.variant.label}` : ""}
            </DialogTitle>
          </DialogHeader>
          {history && history.rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.rows.map((h) => (
                  <TableRow key={h.id} data-testid="history-row">
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(h.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div>{REASON_LABELS[h.reason] ?? h.reason}</div>
                      <div className="text-xs text-muted-foreground">
                        {h.orderNumber ? `Order #${h.orderNumber}` : (h.actor ?? "")}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {h.delta > 0 ? `+${h.delta}` : h.delta}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{h.quantityAfter}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No changes yet.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AdjustDialog({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<"add" | "set">("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<keyof typeof REASONS>("received");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function close() {
    setError(null);
    setAmount("");
    onClose();
  }

  async function save() {
    if (!row) return;
    const value = Number(amount);
    if (!amount.trim() || !Number.isInteger(value)) {
      setError("Enter a whole number.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adjustStock({ data: { variantId: row.variantId, mode, amount: value, reason } });
      await router.invalidate();
      toast.success("Stock updated");
      close();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row ? `${row.title} · ${row.label}` : ""}</DialogTitle>
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
          <p className="text-sm text-muted-foreground">In stock: {row?.quantity}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Change">
              <NativeSelect value={mode} onChange={(e) => setMode(e.target.value as "add")}>
                <NativeSelectOption value="add">Add or remove</NativeSelectOption>
                <NativeSelectOption value="set">Set to</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field label="Amount">
              <Input
                type="number"
                value={amount}
                placeholder={mode === "add" ? "-2 or 10" : "0"}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Reason">
              <NativeSelect value={reason} onChange={(e) => setReason(e.target.value as "received")}>
                {Object.entries(REASONS).map(([value, label]) => (
                  <NativeSelectOption key={value} value={value}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" pending={busy}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
