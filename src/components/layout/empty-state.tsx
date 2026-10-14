import type * as React from "react";

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** The next step, e.g. a Button or link. */
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg bg-muted p-12 text-center">
      <h2 className="text-h3">{title}</h2>
      {description ? (
        <p className="max-w-prose text-body-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
