import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ImageIcon, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CheckField, Field } from "@/client/components/Field";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { Textarea } from "@/client/components/ui/textarea";
import { messageOf } from "@/client/lib/errors";
import { parseMoney, slugify, toAmountInput } from "@/lib/money";
import {
  deleteProduct,
  saveProduct,
  setProductStatus,
  uploadProductImage,
} from "@/serverFunctions/catalog";

type Status = "draft" | "active" | "archived";

interface ProductData {
  id: string;
  title: string;
  handle: string;
  description: string;
  status: Status;
  imageKey: string | null;
  collectionIds: string[];
  variants: {
    id: string;
    label: string;
    sku: string;
    price: number;
    compareAtPrice: number | null;
    trackInventory: boolean;
    quantity: number;
  }[];
}

interface VariantDraft {
  key: string;
  id?: string;
  label: string;
  sku: string;
  price: string;
  compareAt: string;
  track: boolean;
  quantity: string;
}

function blankVariant(): VariantDraft {
  return {
    key: crypto.randomUUID(),
    label: "",
    sku: "",
    price: "",
    compareAt: "",
    track: true,
    quantity: "0",
  };
}

export function ProductForm({
  product,
  collections,
  currency,
}: {
  product: ProductData | null;
  collections: { id: string; name: string }[];
  currency: string;
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const [title, setTitle] = useState(product?.title ?? "");
  const [handle, setHandle] = useState(product?.handle ?? "");
  const [handleEdited, setHandleEdited] = useState(Boolean(product));
  const [description, setDescription] = useState(product?.description ?? "");
  const [status, setStatus] = useState<Status>(product?.status ?? "draft");
  const [collectionIds, setCollectionIds] = useState<string[]>(product?.collectionIds ?? []);
  const [file, setFile] = useState<File | null>(null);
  const [variants, setVariants] = useState<VariantDraft[]>(
    product
      ? product.variants.map((v) => ({
          key: v.id,
          id: v.id,
          label: v.label,
          sku: v.sku,
          price: toAmountInput(v.price, currency),
          compareAt: toAmountInput(v.compareAtPrice, currency),
          track: v.trackInventory,
          quantity: String(v.quantity),
        }))
      : [blankVariant()],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function changeVariant(index: number, change: Partial<VariantDraft>) {
    setVariants((all) => all.map((v, i) => (i === index ? { ...v, ...change } : v)));
  }

  async function run(work: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await work();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  function save() {
    return run(async () => {
      const parsed = [];
      for (const v of variants) {
        const price = parseMoney(v.price, currency);
        if (price === null) throw new Error("Enter a price for every variant.");
        const compareAtPrice = v.compareAt.trim() ? parseMoney(v.compareAt, currency) : null;
        if (v.compareAt.trim() && compareAtPrice === null) {
          throw new Error("Enter compare-at prices as amounts, such as 24.00.");
        }
        const quantity = v.track ? Number(v.quantity || "0") : 0;
        if (!Number.isInteger(quantity) || quantity < 0) {
          throw new Error("Stock is a whole number, 0 or more.");
        }
        parsed.push({
          ...(v.id ? { id: v.id } : {}),
          label: v.label,
          sku: v.sku,
          price,
          compareAtPrice,
          trackInventory: v.track,
          quantity,
        });
      }
      const { id } = await saveProduct({
        data: {
          ...(product ? { id: product.id } : {}),
          title,
          handle,
          description,
          status,
          collectionIds,
          variants: parsed,
        },
      });
      if (file) {
        const form = new FormData();
        form.set("id", id);
        form.set("file", file);
        await uploadProductImage({ data: form });
      }
      toast.success("Product saved");
      if (product) await router.invalidate();
      else await navigate({ to: "/products/$id", params: { id } });
    });
  }

  function archive() {
    return run(async () => {
      await setProductStatus({ data: { id: product!.id, status: "archived" } });
      toast.success("Product archived");
      await router.invalidate();
    });
  }

  function remove() {
    if (!window.confirm(`Delete ${product!.title}? This can't be undone.`)) return;
    return run(async () => {
      await deleteProduct({ data: { id: product!.id } });
      toast.success("Product deleted");
      await navigate({ to: "/products" });
    });
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardContent className="space-y-4">
          <Field label="Title">
            <Input
              value={title}
              required
              onChange={(e) => {
                setTitle(e.target.value);
                if (!handleEdited) setHandle(slugify(e.target.value));
              }}
            />
          </Field>
          <Field label="Handle" hint={`Storefront address: /s/p/${handle || "…"}`}>
            <Input
              value={handle}
              onChange={(e) => {
                setHandleEdited(true);
                setHandle(e.target.value);
              }}
            />
          </Field>
          <Field label="Description">
            <Textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field label="Status">
            <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              <NativeSelectOption value="draft">Draft</NativeSelectOption>
              <NativeSelectOption value="active">Active</NativeSelectOption>
              <NativeSelectOption value="archived">Archived</NativeSelectOption>
            </NativeSelect>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Image</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          {product?.imageKey ? (
            <img
              data-testid="product-image"
              src={`/s/img/${product.id}?v=${encodeURIComponent(product.imageKey)}`}
              alt=""
              className="size-20 rounded-lg border border-border object-cover"
            />
          ) : (
            <span className="flex size-20 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
              <ImageIcon className="size-6" aria-hidden />
            </span>
          )}
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            aria-label="Image"
            data-testid="image-input"
            className="max-w-xs"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </CardContent>
      </Card>

      {collections.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Collections</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            {collections.map((collection) => (
              <CheckField
                key={collection.id}
                label={collection.name}
                checked={collectionIds.includes(collection.id)}
                onChange={(checked) =>
                  setCollectionIds((ids) =>
                    checked
                      ? [...ids, collection.id]
                      : ids.filter((id) => id !== collection.id),
                  )
                }
              />
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Variants</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {variants.map((v, index) => (
            <div
              key={v.key}
              data-testid={`variant-${index}`}
              className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-6"
            >
              <Field label="Option" className="space-y-1.5 sm:col-span-3">
                <Input
                  value={v.label}
                  placeholder="Default"
                  onChange={(e) => changeVariant(index, { label: e.target.value })}
                />
              </Field>
              <Field label="SKU" className="space-y-1.5 sm:col-span-3">
                <Input value={v.sku} onChange={(e) => changeVariant(index, { sku: e.target.value })} />
              </Field>
              <Field label="Price" className="space-y-1.5 sm:col-span-2">
                <Input
                  inputMode="decimal"
                  value={v.price}
                  placeholder={currency}
                  onChange={(e) => changeVariant(index, { price: e.target.value })}
                />
              </Field>
              <Field label="Compare-at price" className="space-y-1.5 sm:col-span-2">
                <Input
                  inputMode="decimal"
                  value={v.compareAt}
                  placeholder={currency}
                  onChange={(e) => changeVariant(index, { compareAt: e.target.value })}
                />
              </Field>
              {v.track ? (
                <Field label="Stock" className="space-y-1.5 sm:col-span-2">
                  <Input
                    type="number"
                    min={0}
                    value={v.quantity}
                    onChange={(e) => changeVariant(index, { quantity: e.target.value })}
                  />
                </Field>
              ) : null}
              <div className="flex items-center justify-between gap-3 sm:col-span-6">
                <CheckField
                  label="Track stock"
                  checked={v.track}
                  onChange={(checked) => changeVariant(index, { track: checked })}
                />
                {variants.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setVariants((all) => all.filter((_, i) => i !== index))}
                  >
                    <Trash2 aria-hidden />
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => setVariants((all) => [...all, blankVariant()])}
          >
            <Plus aria-hidden />
            Add variant
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" pending={busy}>
          Save product
        </Button>
        {product ? (
          <>
            {product.status !== "archived" ? (
              <Button type="button" variant="outline" disabled={busy} onClick={() => void archive()}>
                Archive
              </Button>
            ) : null}
            <Button type="button" variant="destructive" disabled={busy} onClick={() => void remove()}>
              Delete
            </Button>
          </>
        ) : (
          <Button variant="ghost" render={<Link to="/products" />}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
