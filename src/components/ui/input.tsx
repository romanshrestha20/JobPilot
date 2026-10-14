import type * as React from "react";
import { cn } from "./cn";

/** Shared by Input and Textarea so every text control looks and behaves the same. */
export const controlClass =
  "w-full rounded-md border border-input bg-card px-3 text-body-sm text-foreground placeholder:text-muted-foreground transition-colors disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-destructive";

export type InputProps = React.ComponentProps<"input">;

export function Input({ className, type = "text", ...props }: InputProps) {
  return <input type={type} className={cn(controlClass, "h-10", className)} {...props} />;
}
