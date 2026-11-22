import { createFileRoute } from "@tanstack/react-router";
import { ImageIcon } from "lucide-react";
import { z } from "zod";
import { EmptyState } from "@/client/components/EmptyState";
import { Price } from "@/client/components/Price";
import { StoreShell } from "@/client/components/StoreShell";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { getStorefront } from "@/serverFunctions/storefront";

const search = z.object({
  q: z.string().max(200).optional().catch(undefined),
  collection: z.string().max(80).optional().catch(undefined),
});

export const Route = createFileRoute("/s/")({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getStorefront({ data: deps }),
  head: ({ loaderData }) => ({
    meta: loaderData ? [{ title: loaderData.store.name }] : [],
  }),
  component: Storefront,
});

function Storefront() {
  const { store, collections, products } = Route.useLoaderData();
  const { q, collection } = Route.useSearch();

  return (
    <StoreShell storeName={store.name}>
      <h1 className="text-3xl font-semibold tracking-tight">{store.name}</h1>
      {!store.open ? (
        <p data-testid="store-closed" className="text-muted-foreground">
          The store is closed right now. Check back soon.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav className="flex flex-wrap gap-2 text-sm">
              <CollectionLink href={q ? `/s?q=${encodeURIComponent(q)}` : "/s"} active={!collection}>
                All
              </CollectionLink>
              {collections.map((c) => (
                <CollectionLink
                  key={c.handle}
                  href={`/s?collection=${encodeURIComponent(c.handle)}`}
                  active={collection === c.handle}
                >
                  {c.name}
                </CollectionLink>
              ))}
            </nav>
            <form action="/s" method="get" className="flex gap-2">
              {collection ? <input type="hidden" name="collection" value={collection} /> : null}
              <Input
                type="search"
                name="q"
                defaultValue={q ?? ""}
                placeholder="Search"
                aria-label="Search products"
                className="w-48"
              />
              <Button type="submit" variant="outline">
                Search
              </Button>
            </form>
          </div>
          {products.length === 0 ? (
            <EmptyState
              kind={q || collection ? "filtered" : "no-data"}
              title={q || collection ? "Nothing matches" : "Nothing for sale yet"}
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {products.map((p) => (
                <a
                  key={p.id}
                  href={`/s/p/${p.handle}`}
                  data-testid="product-card"
                  className="group space-y-2"
                >
                  <div className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
                    {p.hasImage ? (
                      <img
                        src={`/s/img/${p.id}`}
                        alt={p.title}
                        className="size-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted-foreground">
                        <ImageIcon className="size-8" aria-hidden />
                      </div>
                    )}
                    {p.soldOut ? (
                      <Badge variant="secondary" className="absolute top-2 left-2">
                        Sold out
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-sm font-medium group-hover:underline">{p.title}</div>
                  <Price price={p.price} compareAtPrice={p.compareAtPrice} currency={store.currency} />
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </StoreShell>
  );
}

function CollectionLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: string;
}) {
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "rounded-full bg-primary px-3 py-1 text-primary-foreground"
          : "rounded-full border border-border px-3 py-1 text-muted-foreground hover:text-foreground"
      }
    >
      {children}
    </a>
  );
}
