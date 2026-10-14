import type * as React from "react";
import { cn } from "./cn";

export interface CheckboxProps extends Omit<React.ComponentProps<"input">, "type" | "children"> {
  /** Visible label; the whole row is clickable. */
  label: string;
}

export function Checkbox({ label, className, ...props }: CheckboxProps) {
  return (
    <label className="inline-flex items-center gap-2 text-body-sm text-foreground">
      <input
        type="checkbox"
        className={cn("size-4 rounded-sm border-input accent-primary", className)}
        {...props}
      />
      {label}
    </label>
  );
}
