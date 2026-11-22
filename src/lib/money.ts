/** The currencies a store can sell in, with their minor-unit digits. */
export const CURRENCIES = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  AUD: 2,
  NZD: 2,
  CHF: 2,
  SEK: 2,
  JPY: 0,
} as const;

export type Currency = keyof typeof CURRENCIES;

export function isCurrency(value: string): value is Currency {
  return value in CURRENCIES;
}

function digits(currency: string): number {
  return isCurrency(currency) ? CURRENCIES[currency] : 2;
}

/** 2450 USD as "$24.50". */
export function formatMoney(minor: number, currency: string): string {
  const d = digits(currency);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(minor / 10 ** d);
}

/** "24.50" as 2450 for USD; null when it isn't an amount. */
export function parseMoney(input: string, currency: string): number | null {
  const text = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const d = digits(currency);
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > d) return null;
  return Number(whole) * 10 ** d + Number(fraction.padEnd(d, "0") || "0");
}

/** 2450 USD as "24.50", for an input's value. */
export function toAmountInput(minor: number | null, currency: string): string {
  if (minor === null) return "";
  const d = digits(currency);
  return (minor / 10 ** d).toFixed(d);
}

/** "Small Blue Mug!" as "small-blue-mug". */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
