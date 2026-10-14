import type * as React from "react";
import { cn } from "./cn";

const variants = {
  info: "border-info/40 bg-info-soft text-info",
  success: "border-success/40 bg-success-soft text-success",
  warning: "border-warning/40 bg-warning-soft text-warning",
  destructive: "border-destructive/40 bg-danger-soft text-destructive",
} as const;

export interface AlertProps extends React.ComponentProps<"div"> {
  variant?: keyof typeof variants;
}

/** Feedback message. Errors use role="alert"; everything else is a polite status. */
export function Alert({ variant = "info", className, ...props }: AlertProps) {
  return (
    <div
      role={variant === "destructive" ? "alert" : "status"}
      className={cn("rounded-md border px-4 py-3 text-body-sm", variants[variant], className)}
      {...props}
    />
  );
}

export function AlertTitle({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("font-medium", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-body-sm", className)} {...props} />;
}
