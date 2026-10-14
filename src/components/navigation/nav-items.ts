/**
 * The application's navigation, defined once. Only routes that exist are listed: add an item here
 * when its page ships, and never link to a placeholder.
 */
export type NavIconName = "home" | "briefcase" | "user";

export interface NavItem {
  label: string;
  href: string;
  icon: NavIconName;
  /** `exact`: only this path. `section`: this path and everything nested under it. */
  match: "exact" | "section";
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Home", href: "/", icon: "home", match: "exact" },
      { label: "My jobs", href: "/jobs", icon: "briefcase", match: "section" },
    ],
  },
  {
    label: "Personal",
    items: [{ label: "My profile", href: "/profile", icon: "user", match: "section" }],
  },
];

/** `page`: this is the current page. `section`: the current page is nested inside this item. */
export type NavState = "page" | "section" | null;

function stripTrailingSlash(path: string) {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/** Whether a nav item is the current page, an ancestor section of it, or neither. */
export function getNavState(pathname: string | null, item: NavItem): NavState {
  if (!pathname) return null;
  const current = stripTrailingSlash(pathname);
  if (current === item.href) return "page";
  if (item.match === "section" && current.startsWith(`${item.href}/`)) return "section";
  return null;
}
