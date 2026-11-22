import { useSyncExternalStore } from "react";

export interface CartLine {
  variantId: string;
  quantity: number;
}

const KEY = "store-cart";
const EMPTY: CartLine[] = [];
let cached: { raw: string | null; lines: CartLine[] } = { raw: null, lines: EMPTY };
const listeners = new Set<() => void>();

function read(): CartLine[] {
  const raw = window.localStorage.getItem(KEY);
  if (raw === cached.raw) return cached.lines;
  let lines: CartLine[] = EMPTY;
  try {
    const parsed = JSON.parse(raw ?? "[]") as unknown;
    if (Array.isArray(parsed)) {
      lines = parsed.filter(
        (l): l is CartLine =>
          typeof l?.variantId === "string" && Number.isInteger(l?.quantity) && l.quantity > 0,
      );
    }
  } catch {
    lines = EMPTY;
  }
  cached = { raw, lines };
  return lines;
}

export function writeCart(lines: CartLine[]) {
  window.localStorage.setItem(KEY, JSON.stringify(lines));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => event.key === KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The buyer's cart, kept in this browser. Empty while the page renders on the server. */
export function useCart(): CartLine[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function addToCart(variantId: string, quantity: number, available: number | null) {
  const lines = read();
  const existing = lines.find((l) => l.variantId === variantId);
  const wanted = (existing?.quantity ?? 0) + quantity;
  const capped = available === null ? wanted : Math.min(wanted, available);
  writeCart(
    existing
      ? lines.map((l) => (l.variantId === variantId ? { ...l, quantity: capped } : l))
      : [...lines, { variantId, quantity: capped }],
  );
}
