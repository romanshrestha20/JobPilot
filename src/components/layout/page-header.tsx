import type * as React from "react";

import { Breadcrumbs, type BreadcrumbItem } from "./breadcrumbs";

export interface PageHeaderProps {
  /** Path back up to the section; the last item is the current page. */
  breadcrumbs?: BreadcrumbItem[];
  title: string;
  description?: string;
  /** Right-aligned actions, e.g. a primary Button. */
  actions?: React.ReactNode;
}

export function PageHeader({ breadcrumbs, title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-col gap-3">
      {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1 wrap-anywhere">
          <h1 className="text-h1">{title}</h1>
          {description ? <p className="text-body text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
