import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { EmptyState } from "@/client/components/EmptyState";
import { Field } from "@/client/components/Field";
import { PageHeader } from "@/client/components/PageHeader";
import { Pager } from "@/client/components/Pager";
import { SearchInput } from "@/client/components/SearchInput";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
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
import { Textarea } from "@/client/components/ui/textarea";
import { formatDate, messageOf } from "@/client/lib/errors";
import { formatMoney } from "@/lib/money";
import { createCustomer, getCustomers } from "@/serverFunctions/customers";
import { getStoreCurrency } from "@/serverFunctions/staff";
import { StaffError } from "../../_staff";

const search = z.object({
  q: z.string().optional().catch(undefined),
  sort: z.enum(["spent", "last", "name"]).optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
});

export const Route = createFileRoute("/_staff/customers/")({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [list, currency] = await Promise.all([getCustomers({ data: deps }), getStoreCurrency()]);
    return { ...list, currency };
  },
  head: () => ({ meta: [{ title: "Customers" }] }),
  errorComponent: StaffError,
  component: Customers,
});

function Customers() {
  const { rows, total, page, pageSize, currency } = Route.useLoaderData();
  const filters = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [adding, setAdding] = useState(false);
  const set = useCallback(
    (change: Partial<z.infer<typeof search>>) =>
      navigate({ search: (prev) => ({ ...prev, page: undefined, ...change }), replace: true }),
    [navigate],
  );

  return (
    <>
      <PageHeader
        title="Customers"
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            Add customer
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={filters.q ?? ""}
          placeholder="Search by name or email"
          onSearch={(q) => set({ q: q || undefined })}
        />
        <div className="flex items-center gap-2">
          <Label htmlFor="customer-sort">Sort</Label>
          <NativeSelect
            id="customer-sort"
            value={filters.sort ?? "spent"}
            onChange={(e) => set({ sort: e.target.value as "spent" })}
          >
            <NativeSelectOption value="spent">Total spent</NativeSelectOption>
            <NativeSelectOption value="last">Last order</NativeSelectOption>
            <NativeSelectOption value="name">Name</NativeSelectOption>
          </NativeSelect>
        </div>
      </div>
      {rows.length === 0 ? (
        filters.q ? (
          <EmptyState kind="filtered" title="No customers match" />
        ) : (
          <EmptyState
            title="No customers yet"
            description="Buyers are added when they check out, or add one yourself."
          />
        )
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead>Last order</TableHead>
              <TableHead className="text-right">Spent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} data-testid="customer-row">
                <TableCell>
                  <Link
                    to="/customers/$id"
                    params={{ id: row.id }}
                    className="font-medium hover:underline"
                  >
                    {row.name || row.email}
                  </Link>
                  <div className="text-xs text-muted-foreground">{row.email}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.orderCount}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(row.lastOrderAt)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(row.totalSpent, currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Pager page={page} pageSize={pageSize} total={total} onPage={(p) => set({ page: p })} />
      <AddCustomerDialog open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

function AddCustomerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function close() {
    setName("");
    setEmail("");
    setNotes("");
    setError(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add customer</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await createCustomer({ data: { name, email, notes } });
              toast.success("Customer added");
              await router.invalidate();
              close();
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
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Notes">
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" pending={busy}>
              Add customer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
