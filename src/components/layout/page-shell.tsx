import type * as React from "react";
import { cn } from "@/components/ui/cn";

const widths = { narrow: "max-w-sm", form: "max-w-xl", wide: "max-w-[1200px]" } as const;

export interface PageShellProps extends React.ComponentProps<"main"> {
  width?: keyof typeof widths;
  /** Vertically center the content (auth screens). */
  centered?: boolean;
}

/** Page container: background, gutters (16px mobile, 32px desktop) and max width. */
export function PageShell({ width = "form", centered, className, ...props }: PageShellProps) {
  return (
    <div
      className={cn(
        "flex flex-1 justify-center bg-background px-4 sm:px-8",
        centered ? "items-center py-8" : "py-12",
      )}
    >
      <main
        id="main-content"
        tabIndex={-1}
        className={cn("w-full focus-visible:outline-none", widths[width], className)}
        {...props}
      />
    </div>
  );
}
