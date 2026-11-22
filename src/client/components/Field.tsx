import { useId, type ReactElement, type ReactNode, cloneElement } from "react";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Label } from "@/client/components/ui/label";

/** A label above one control; the control gets the label's id. */
export function Field({
  label,
  children,
  hint,
  className,
}: {
  label: ReactNode;
  children: ReactElement<{ id?: string }>;
  hint?: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className ?? "space-y-1.5"}>
      <Label htmlFor={id}>{label}</Label>
      {cloneElement(children, { id })}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** A checkbox with its label beside it; the label's text toggles it too. */
export function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Checkbox
        aria-label={label}
        checked={checked}
        onCheckedChange={(next) => onChange(next)}
      />
      <span aria-hidden className="cursor-pointer select-none" onClick={() => onChange(!checked)}>
        {label}
      </span>
    </div>
  );
}
