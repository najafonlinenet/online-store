import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { CopyButton } from "@/client/components/CopyButton";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { getOverview } from "@/serverFunctions/staff";
import { StaffError } from "../_staff";

export const Route = createFileRoute("/_staff/")({
  loader: () => getOverview(),
  head: ({ loaderData }) => ({
    meta: loaderData ? [{ title: loaderData.store.name }] : [],
  }),
  errorComponent: StaffError,
  component: Home,
});

function Home() {
  const { store, storeUrl, toShip, lowStock } = Route.useLoaderData();
  return (
    <>
      <PageHeader
        title={store.name}
        description={
          store.open ? (
            <Badge variant="success">Storefront open</Badge>
          ) : (
            <Badge variant="secondary">Storefront closed</Badge>
          )
        }
        actions={
          <Button
            variant="outline"
            render={<a href="/s" target="_blank" rel="noreferrer" />}
          >
            <ExternalLink aria-hidden />
            View storefront
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Store link</CardTitle>
          <CardDescription>Anyone with this link can shop.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <code className="min-w-0 truncate text-sm">{storeUrl}</code>
          <CopyButton value={storeUrl} successMessage="Link copied" />
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        {toShip !== null ? (
          <Card>
            <CardHeader>
              <CardDescription>Orders to fulfill</CardDescription>
              <CardTitle className="text-3xl">{toShip}</CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                to="/orders"
                search={{ fulfillment: "unfulfilled" }}
                className="text-sm text-primary hover:underline"
              >
                Open orders
              </Link>
            </CardContent>
          </Card>
        ) : null}
        {lowStock !== null ? (
          <Card>
            <CardHeader>
              <CardDescription>Variants low on stock</CardDescription>
              <CardTitle className="text-3xl">{lowStock}</CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                to="/inventory"
                search={{ filter: "low" }}
                className="text-sm text-primary hover:underline"
              >
                Open inventory
              </Link>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
