import { Suspense } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountPanel } from "./account-panel";
import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";
import { ThemeSelect } from "./theme-select";

function AccountFallback() {
  return <Skeleton className="h-24 w-full" />;
}

/**
 * Frame for every signed-in screen: skip link, a 240px sidebar from `md` up, a top bar with the
 * theme picker (and the menu button on phones), and the page content. Sign-in and sign-up live
 * outside it. Authorization is still enforced by each page and action, not by this layout.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const account = (
    <Suspense fallback={<AccountFallback />}>
      <AccountPanel />
    </Suspense>
  );

  return (
    <div className="flex min-h-dvh flex-1">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:text-label focus:text-foreground focus:shadow-md"
      >
        Skip to main content
      </a>

      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r bg-card px-4 pb-4 md:flex">
        {/* Same height and rule as the top bar, so the brand and the bar line up. */}
        <Link
          href="/"
          className="-mx-4 flex h-14 shrink-0 items-center border-b px-7 text-h3 text-foreground"
        >
          JobPilot
        </Link>
        <nav aria-label="Main">
          <NavLinks />
        </nav>
        <div className="mt-auto">{account}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-2 border-b bg-background px-4 sm:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <MobileNav account={account} />
            <Link href="/" className="text-h3 text-foreground">
              JobPilot
            </Link>
          </div>
          <div className="ml-auto">
            <ThemeSelect />
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
