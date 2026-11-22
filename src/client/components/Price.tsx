import { formatMoney } from "@/lib/money";

/** A price, with the compare-at price struck through beside it when set. */
export function Price({
  price,
  compareAtPrice,
  currency,
}: {
  price: number;
  compareAtPrice: number | null;
  currency: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="font-medium tabular-nums">{formatMoney(price, currency)}</span>
      {compareAtPrice !== null && compareAtPrice > price ? (
        <s className="text-sm text-muted-foreground tabular-nums">
          {formatMoney(compareAtPrice, currency)}
        </s>
      ) : null}
    </span>
  );
}
