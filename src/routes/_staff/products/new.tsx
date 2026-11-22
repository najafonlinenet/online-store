import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/client/components/PageHeader";
import { ProductForm } from "@/client/components/ProductForm";
import { getProductForm } from "@/serverFunctions/catalog";
import { StaffError } from "../../_staff";

export const Route = createFileRoute("/_staff/products/new")({
  loader: () => getProductForm({ data: { id: null } }),
  head: () => ({ meta: [{ title: "New product" }] }),
  errorComponent: StaffError,
  component: NewProduct,
});

function NewProduct() {
  const { collections, currency } = Route.useLoaderData();
  return (
    <>
      <PageHeader title="New product" />
      <ProductForm product={null} collections={collections} currency={currency} />
    </>
  );
}
