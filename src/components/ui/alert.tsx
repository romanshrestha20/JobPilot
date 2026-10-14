import type * as React from "react";
import { cn } from "./cn";

const variants = {
  info: "border-info/40 bg-info-soft text-info",
  success: "border-success/40 bg-success-soft text-success",
  warning: "border-warning/40 bg-warning-soft text-warning",
  destructive: "border-destructive/40 bg-danger-soft text-destructive",
} as const;

// A distinct icon shape per variant, so the state is never carried by colour alone.
const icons = {
  info: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </>
  ),
  success: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  warning: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  destructive: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6M9 9l6 6" />
    </>
  ),
} as const;

export interface AlertProps extends React.ComponentProps<"div"> {
  variant?: keyof typeof variants;
}

/** Feedback message. Errors use role="alert"; everything else is a polite status. */
export function Alert({ variant = "info", className, children, ...props }: AlertProps) {
  return (
    <div
      role={variant === "destructive" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-md border px-4 py-3 text-body-sm",
        variants[variant],
        className,
      )}
      {...props}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 size-4 shrink-0"
      >
        {icons[variant]}
      </svg>
      <div className="min-w-0 flex-1 wrap-anywhere">{children}</div>
    </div>
  );
}

export function AlertTitle({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("font-medium", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-body-sm", className)} {...props} />;
}
