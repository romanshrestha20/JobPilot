import type * as React from "react";
import { cn } from "./cn";
import { controlClass } from "./input";

export type TextareaProps = React.ComponentProps<"textarea">;

export function Textarea({ className, rows = 4, ...props }: TextareaProps) {
  return <textarea rows={rows} className={cn(controlClass, "py-2", className)} {...props} />;
}
