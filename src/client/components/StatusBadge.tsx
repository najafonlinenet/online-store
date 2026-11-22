import { Badge } from "@/client/components/ui/badge";

const PAYMENT = {
  pending: { label: "Pending", variant: "warning" },
  paid: { label: "Paid", variant: "success" },
  refunded: { label: "Refunded", variant: "secondary" },
} as const;

export function PaymentBadge({ status }: { status: keyof typeof PAYMENT }) {
  const { label, variant } = PAYMENT[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function FulfillmentBadge({
  status,
  cancelled,
}: {
  status: "unfulfilled" | "fulfilled";
  cancelled: boolean;
}) {
  if (cancelled) return <Badge variant="destructive">Cancelled</Badge>;
  return status === "fulfilled" ? (
    <Badge variant="success">Fulfilled</Badge>
  ) : (
    <Badge variant="outline">Unfulfilled</Badge>
  );
}

const PRODUCT = {
  active: "success",
  draft: "outline",
  archived: "secondary",
} as const;

export function ProductStatusBadge({ status }: { status: keyof typeof PRODUCT }) {
  return (
    <Badge variant={PRODUCT[status]} className="capitalize">
      {status}
    </Badge>
  );
}
