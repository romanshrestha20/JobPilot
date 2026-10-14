import Link from "next/link";

export interface BreadcrumbItem {
  label: string;
  /** Omit on the last item: it is the current page. */
  href?: string;
}

/** Where the user is, as a path back up. The last item is the current page and is not a link. */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li
              key={`${item.label}-${index}`}
              className="flex min-w-0 items-center gap-2 wrap-anywhere"
            >
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="underline-offset-4 hover:text-foreground hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current="page" className="text-foreground">
                  {item.label}
                </span>
              )}
              {isLast ? null : <span aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
