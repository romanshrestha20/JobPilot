import type * as React from "react";
import { cn } from "./cn";

const tones = {
  neutral: "bg-secondary text-secondary-foreground",
  accent: "bg-accent text-accent-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  danger: "bg-danger-soft text-destructive",
  /** Outlined chip for skills and keywords. */
  tag: "border border-border text-muted-foreground",
} as const;

export interface BadgeProps extends React.ComponentProps<"span"> {
  tone?: keyof typeof tones;
}

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-2 py-1 text-label font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
