import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ImageIcon, Plus } from "lucide-react";
import { useCallback } from "react";
import { z } from "zod";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Pager } from "@/client/components/Pager";
import { SearchInput } from "@/client/components/SearchInput";
import { ProductStatusBadge } from "@/client/components/StatusBadge";
import { Button } from "@/client/components/ui/button";
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
import { formatMoney } from "@/lib/money";
import { getProducts } from "@/serverFunctions/catalog";
import { StaffError } from "../../_staff";

const search = z.object({
  q: z.string().optional().catch(undefined),
  status: z.enum(["all", "draft", "active", "archived"]).optional().catch(undefined),
  sort: z.enum(["updated", "title", "created"]).optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
});

export const Route = createFileRoute("/_staff/products/")({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getProducts({ data: deps }),
  head: () => ({ meta: [{ title: "Products" }] }),
  errorComponent: StaffError,
  component: Products,
});

function Products() {
  const { rows, total, page, pageSize, currency } = Route.useLoaderData();
  const filters = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const set = useCallback(
    (change: Partial<z.infer<typeof search>>) =>
      navigate({ search: (prev) => ({ ...prev, page: undefined, ...change }), replace: true }),
    [navigate],
  );
  const filtered = Boolean(filters.q) || (filters.status ?? "all") !== "all";

  return (
    <>
      <PageHeader
        title="Products"
        actions={
          <Button render={<Link to="/products/new" />}>
            <Plus aria-hidden />
            New product
          </Button>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          value={filters.q ?? ""}
          placeholder="Search products"
          onSearch={(q) => set({ q: q || undefined })}
        />
        <div className="flex items-center gap-2">
          <Label htmlFor="status-filter">Status</Label>
          <NativeSelect
            id="status-filter"
            value={filters.status ?? "all"}
            onChange={(e) => set({ status: e.target.value as "all" })}
          >
            <NativeSelectOption value="all">All</NativeSelectOption>
            <NativeSelectOption value="active">Active</NativeSelectOption>
            <NativeSelectOption value="draft">Draft</NativeSelectOption>
            <NativeSelectOption value="archived">Archived</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="sort">Sort</Label>
          <NativeSelect
            id="sort"
            value={filters.sort ?? "updated"}
            onChange={(e) => set({ sort: e.target.value as "updated" })}
          >
            <NativeSelectOption value="updated">Last updated</NativeSelectOption>
            <NativeSelectOption value="created">Newest</NativeSelectOption>
            <NativeSelectOption value="title">Title</NativeSelectOption>
          </NativeSelect>
        </div>
      </div>
      {rows.length === 0 ? (
        filtered ? (
          <EmptyState kind="filtered" title="No products match" />
        ) : (
          <EmptyState
            title="No products yet"
            description="Add your first product to start selling."
            action={<Button render={<Link to="/products/new" />}>New product</Button>}
          />
        )
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} data-testid="product-row">
                <TableCell>
                  <Link
                    to="/products/$id"
                    params={{ id: row.id }}
                    className="flex items-center gap-3 font-medium hover:underline"
                  >
                    {row.imageKey ? (
                      <img
                        src={`/s/img/${row.id}`}
                        alt=""
                        className="size-9 rounded-md border border-border object-cover"
                      />
                    ) : (
                      <span className="flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground">
                        <ImageIcon className="size-4" aria-hidden />
                      </span>
                    )}
                    {row.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <ProductStatusBadge status={row.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.stock === null ? "—" : row.stock}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(row.minPrice ?? 0, currency)}
                  {row.variantCount > 1 ? "+" : ""}
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
