import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Pager } from "@/client/components/Pager";
import { SearchInput } from "@/client/components/SearchInput";
import { FulfillmentBadge, PaymentBadge } from "@/client/components/StatusBadge";
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
import { formatDate } from "@/client/lib/errors";
import { formatMoney } from "@/lib/money";
import { getOrders } from "@/serverFunctions/orders";
import { StaffError } from "../../_staff";

const search = z.object({
  q: z.string().optional().catch(undefined),
  payment: z.enum(["all", "pending", "paid", "refunded"]).optional().catch(undefined),
  fulfillment: z.enum(["all", "unfulfilled", "fulfilled", "cancelled"]).optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
});

export const Route = createFileRoute("/_staff/orders/")({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getOrders({ data: deps }),
  head: () => ({ meta: [{ title: "Orders" }] }),
  errorComponent: StaffError,
  component: Orders,
});

function Orders() {
  const { rows, total, page, pageSize } = Route.useLoaderData();
  const filters = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const set = useCallback(
    (change: Partial<z.infer<typeof search>>) =>
      navigate({ search: (prev) => ({ ...prev, page: undefined, ...change }), replace: true }),
    [navigate],
  );
  const filtered =
    Boolean(filters.q) ||
    (filters.payment ?? "all") !== "all" ||
    (filters.fulfillment ?? "all") !== "all";

  return (
    <>
      <PageHeader title="Orders" />
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={filters.q ?? ""}
          placeholder="Search by number or email"
          onSearch={(q) => set({ q: q || undefined })}
        />
        <div className="flex items-center gap-2">
          <Label htmlFor="payment-filter">Payment</Label>
          <NativeSelect
            id="payment-filter"
            value={filters.payment ?? "all"}
            onChange={(e) => set({ payment: e.target.value as "all" })}
          >
            <NativeSelectOption value="all">All</NativeSelectOption>
            <NativeSelectOption value="pending">Pending</NativeSelectOption>
            <NativeSelectOption value="paid">Paid</NativeSelectOption>
            <NativeSelectOption value="refunded">Refunded</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="fulfillment-filter">Fulfillment</Label>
          <NativeSelect
            id="fulfillment-filter"
            value={filters.fulfillment ?? "all"}
            onChange={(e) => set({ fulfillment: e.target.value as "all" })}
          >
            <NativeSelectOption value="all">All</NativeSelectOption>
            <NativeSelectOption value="unfulfilled">Unfulfilled</NativeSelectOption>
            <NativeSelectOption value="fulfilled">Fulfilled</NativeSelectOption>
            <NativeSelectOption value="cancelled">Cancelled</NativeSelectOption>
          </NativeSelect>
        </div>
      </div>
      {rows.length === 0 ? (
        filtered ? (
          <EmptyState kind="filtered" title="No orders match" />
        ) : (
          <EmptyState
            title="No orders yet"
            description="Orders placed on your storefront appear here."
          />
        )
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} data-testid="order-row">
                <TableCell>
                  <Link
                    to="/orders/$id"
                    params={{ id: row.id }}
                    className="font-medium hover:underline"
                  >
                    #{row.number}
                  </Link>
                  <div className="text-xs text-muted-foreground">{formatDate(row.createdAt)}</div>
                </TableCell>
                <TableCell>
                  <div>{row.name}</div>
                  <div className="text-xs text-muted-foreground">{row.email}</div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <PaymentBadge status={row.paymentStatus} />
                    <FulfillmentBadge status={row.fulfillmentStatus} cancelled={Boolean(row.cancelledAt)} />
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(row.total, row.currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Pager page={page} pageSize={pageSize} total={total} onPage={(p) => set({ page: p })} />
    </>
  );
}
