import { createFileRoute, notFound } from "@tanstack/react-router";
import { ChevronLeft, ImageIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/client/components/Field";
import { Price } from "@/client/components/Price";
import { StoreNotFound, StoreShell } from "@/client/components/StoreShell";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { addToCart, useCart } from "@/client/lib/cart";
import { getStorefrontProduct } from "@/serverFunctions/storefront";

export const Route = createFileRoute("/s/p/$handle")({
  loader: async ({ params }) => {
    const data = await getStorefrontProduct({ data: { handle: params.handle } });
    if (data.store.open && !data.product) throw notFound();
    return data;
  },
  head: ({ loaderData }) => ({
    meta: loaderData?.product
      ? [{ title: `${loaderData.product.title} · ${loaderData.store.name}` }]
      : [],
  }),
  notFoundComponent: StoreNotFound,
  component: ProductPage,
});

function ProductPage() {
  const { store, product } = Route.useLoaderData();
  const cart = useCart();
  const [variantId, setVariantId] = useState(
    product?.variants.find((v) => v.available === null || v.available > 0)?.id ??
      product?.variants[0]?.id,
  );
  const [quantity, setQuantity] = useState("1");

  if (!product) {
    return (
      <StoreShell storeName={store.name}>
        <p data-testid="store-closed" className="text-muted-foreground">
          The store is closed right now. Check back soon.
        </p>
      </StoreShell>
    );
  }
  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0]!;
  const inCart = cart.find((l) => l.variantId === variant.id)?.quantity ?? 0;
  const left = variant.available === null ? null : Math.max(0, variant.available - inCart);
  const soldOut = variant.available !== null && variant.available <= 0;

  function add() {
    const wanted = Math.max(1, Math.floor(Number(quantity) || 1));
    if (left !== null && left <= 0) {
      toast.error("All available stock is already in your cart.");
      return;
    }
    addToCart(variant.id, wanted, variant.available);
    toast.success("Added to cart");
  }

  return (
    <StoreShell storeName={store.name}>
      <a
        href="/s"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        All products
      </a>
      <div className="grid gap-8 md:grid-cols-2">
        <div className="aspect-square overflow-hidden rounded-xl border border-border bg-muted">
          {product.hasImage ? (
            <img src={`/s/img/${product.id}`} alt={product.title} className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <ImageIcon className="size-10" aria-hidden />
            </div>
          )}
        </div>
        <div className="space-y-5">
          <h1 className="text-3xl font-semibold tracking-tight">{product.title}</h1>
          <Price price={variant.price} compareAtPrice={variant.compareAtPrice} currency={store.currency} />
          {product.description ? (
            <p className="text-sm whitespace-pre-line text-muted-foreground">{product.description}</p>
          ) : null}
          {product.variants.length > 1 ? (
            <Field label="Option">
              <NativeSelect
                className="w-full"
                value={variant.id}
                onChange={(e) => {
                  setVariantId(e.target.value);
                  setQuantity("1");
                }}
              >
                {product.variants.map((v) => (
                  <NativeSelectOption key={v.id} value={v.id}>
                    {v.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          ) : null}
          {soldOut ? (
            <Button disabled className="w-full">
              Sold out
            </Button>
          ) : (
            <form
              className="flex items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <Field label="Quantity" className="w-24 space-y-1.5">
                <Input
                  type="number"
                  min={1}
                  max={variant.available ?? undefined}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </Field>
              <Button type="submit" className="flex-1">
                Add to cart
              </Button>
            </form>
          )}
        </div>
      </div>
    </StoreShell>
  );
}
