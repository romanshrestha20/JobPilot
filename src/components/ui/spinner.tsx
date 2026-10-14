import type * as React from "react";
import { cn } from "./cn";

export interface SpinnerProps extends React.ComponentProps<"span"> {
  /** Announced to assistive tech. Pass an empty string when a nearby label already says it. */
  label?: string;
}

export function Spinner({ label = "Loading", className, ...props }: SpinnerProps) {
  return (
    <span role={label ? "status" : undefined} className={cn("inline-flex", className)} {...props}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        className="size-4 motion-safe:animate-spin"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
