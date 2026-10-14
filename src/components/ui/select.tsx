import type * as React from "react";
import { cn } from "./cn";
import { controlClass } from "./input";

export type SelectProps = React.ComponentProps<"select">;

/** Native select, styled like Input. Pair with a label via `FormField`. */
export function Select({ className, ...props }: SelectProps) {
  return <select className={cn(controlClass, "h-10", className)} {...props} />;
}
