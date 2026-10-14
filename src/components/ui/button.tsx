import type * as React from "react";
import { cn } from "./cn";
import { Spinner } from "./spinner";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-label font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed";

const variants = {
  primary: "bg-primary text-primary-foreground hover:bg-accent-foreground hover:text-accent",
  secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
  ghost: "text-foreground hover:bg-accent",
  destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
} as const;

const sizes = {
  sm: "h-8 px-3",
  md: "h-10 px-4",
} as const;

/** Button styling for non-button elements, e.g. a Next.js `<Link>` that acts as the main action. */
export function buttonVariants({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  className?: string;
} = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

export interface ButtonProps extends React.ComponentProps<"button"> {
  /** primary: the one main action of a view. destructive: irreversible removal only. */
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  /** Disables the button and shows a spinner. */
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  type = "button",
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonVariants({ variant, size, className })}
      {...props}
    >
      {loading ? <Spinner label="" /> : null}
      {children}
    </button>
  );
}
