import {
  createFileRoute,
  Link,
  Outlet,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { ErrorState } from "@/client/components/ErrorState";
import { isAccessDenied, messageOf } from "@/client/lib/errors";
import { getMe } from "@/serverFunctions/staff";

export const Route = createFileRoute("/_staff")({
  loader: () => getMe(),
  component: StaffLayout,
});

const LINKS = [
  { to: "/orders", label: "Orders", area: "orders" },
  { to: "/products", label: "Products", area: "products" },
  { to: "/collections", label: "Collections", area: "products" },
  { to: "/inventory", label: "Inventory", area: "products" },
  { to: "/customers", label: "Customers", area: "customers" },
  { to: "/discounts", label: "Discounts", area: "products" },
  { to: "/settings", label: "Settings", area: "admin" },
] as const;

function StaffNav() {
  const me = Route.useLoaderData();
  const links = LINKS.filter((link) =>
    link.area === "admin" ? me.isAdmin : me.areas.includes(link.area),
  );
  return (
    <nav className="flex min-w-0 items-center gap-3 overflow-x-auto text-sm whitespace-nowrap">
      <Link
        to="/"
        className="font-medium text-foreground"
        activeOptions={{ exact: true }}
      >
        Store
      </Link>
      {links.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          className="text-muted-foreground transition-colors hover:text-foreground"
          activeProps={{ className: "text-foreground" }}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

function StaffLayout() {
  return (
    <AppShell nav={<StaffNav />}>
      <Outlet />
    </AppShell>
  );
}

/** What a staff page shows when its loader was refused or failed. */
export function StaffError({ error }: ErrorComponentProps) {
  if (isAccessDenied(error)) {
    return (
      <div data-testid="access-denied">
        <EmptyState
          kind="error"
          variant="plain"
          size="lg"
          title="No access"
          description="An admin can give you access in Settings."
        />
      </div>
    );
  }
  return <ErrorState variant="page" message={messageOf(error)} />;
}
