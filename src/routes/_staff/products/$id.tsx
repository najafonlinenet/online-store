import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/client/components/PageHeader";
import { ProductForm } from "@/client/components/ProductForm";
import { ProductStatusBadge } from "@/client/components/StatusBadge";
import { getProductForm } from "@/serverFunctions/catalog";
import { StaffError } from "../../_staff";

export const Route = createFileRoute("/_staff/products/$id")({
  loader: ({ params }) => getProductForm({ data: { id: params.id } }),
  head: ({ loaderData }) => ({
    meta: loaderData?.product ? [{ title: loaderData.product.title }] : [],
  }),
  errorComponent: StaffError,
  component: EditProduct,
});

function EditProduct() {
  const { product, collections, currency } = Route.useLoaderData();
  if (!product) return null;
  return (
    <>
      <PageHeader
        title={product.title}
        description={<ProductStatusBadge status={product.status} />}
        backLink={
          <Link
            to="/products"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden />
            Products
          </Link>
        }
      />
      <ProductForm
        key={`${product.id}:${product.updatedAt}`}
        product={product}
        collections={collections}
        currency={currency}
      />
    </>
  );
}
