import type * as React from "react";
import { cn } from "./cn";

export const labelClass = "text-label font-medium text-foreground";

export type LabelProps = React.ComponentProps<"label">;

export function Label({ className, ...props }: LabelProps) {
  return <label className={cn(labelClass, className)} {...props} />;
}
