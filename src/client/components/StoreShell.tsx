import { ShoppingBag } from "lucide-react";
import type { ReactNode } from "react";
import { useCart } from "@/client/lib/cart";

/**
 * The frame of the public storefront: the store's name and the cart. Its
 * links are full page loads, so a buyer without an account never calls the
 * app's private server functions.
 */
export function StoreShell({ storeName, children }: { storeName: string; children: ReactNode }) {
  const cart = useCart();
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <div className="flex h-dvh flex-col">
      <header className="shrink-0 border-b border-border">
        <div className={`${COLUMN} flex h-14 items-center justify-between gap-3`}>
          <a href="/s" className="truncate font-semibold">
            {storeName}
          </a>
          <a
            href="/s/cart"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ShoppingBag className="size-4" aria-hidden />
            Cart
            <span
              data-testid="cart-count"
              className="min-w-5 rounded-full bg-primary px-1.5 text-center text-xs text-primary-foreground tabular-nums"
            >
              {count}
            </span>
          </a>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <main className={`${COLUMN} space-y-8 pt-8 pb-24`}>{children}</main>
      </div>
    </div>
  );
}

const COLUMN = "mx-auto w-full max-w-5xl px-4 md:px-10";

export function StoreNotFound() {
  return (
    <StoreShell storeName="Store">
      <div className="space-y-2 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
        <p className="text-sm text-muted-foreground">
          <a href="/s" className="text-primary hover:underline">
            Back to the store
          </a>
        </p>
      </div>
    </StoreShell>
  );
}
