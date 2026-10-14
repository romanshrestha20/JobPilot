import Link from "next/link";
import { cn } from "@/components/ui/cn";
import { Icon } from "./nav-icons";
import { NAV_GROUPS, getNavState } from "./nav-items";

const itemClass = "flex h-10 items-center gap-3 rounded-md px-3 text-label transition-colors";
const inactiveClass = "text-muted-foreground hover:bg-muted hover:text-foreground";
const activeClass = "bg-accent font-medium text-accent-foreground";

/**
 * The grouped links. Presentational: `activePath` comes from the client wrapper (or is null for
 * the static fallback), so the same markup serves the sidebar, the mobile drawer and Suspense.
 */
export function NavList({ activePath }: { activePath: string | null }) {
  return (
    <div className="flex flex-col gap-6">
      {NAV_GROUPS.map((group) => {
        const headingId = `nav-group-${group.label.toLowerCase()}`;
        return (
          <div key={group.label} className="flex flex-col gap-1">
            <p id={headingId} className="px-3 text-eyebrow uppercase text-muted-foreground">
              {group.label}
            </p>
            <ul aria-labelledby={headingId} className="flex flex-col gap-1">
              {group.items.map((item) => {
                const state = getNavState(activePath, item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      // `page` only on the exact page; an ancestor section is marked `true`.
                      aria-current={
                        state === "page" ? "page" : state === "section" ? "true" : undefined
                      }
                      className={cn(itemClass, state ? activeClass : inactiveClass)}
                    >
                      <Icon name={item.icon} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
