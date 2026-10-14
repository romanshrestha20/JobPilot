import type * as React from "react";
import { cn } from "./cn";

/** Placeholder block for content that is loading. Size it with className. */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-md bg-muted motion-safe:animate-pulse", className)}
      {...props}
    />
  );
}
