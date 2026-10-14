"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { NavList } from "./nav-list";

function ActiveNavList() {
  return <NavList activePath={usePathname()} />;
}

/** The nav links with the current route highlighted. */
export function NavLinks() {
  // usePathname needs a Suspense boundary under Cache Components; the fallback is the same links
  // without an active item.
  return (
    <Suspense fallback={<NavList activePath={null} />}>
      <ActiveNavList />
    </Suspense>
  );
}
