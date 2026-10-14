import type * as React from "react";

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Right-aligned actions, e.g. a primary Button. */
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1 wrap-anywhere">
        <h1 className="text-h1">{title}</h1>
        {description ? <p className="text-body text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
