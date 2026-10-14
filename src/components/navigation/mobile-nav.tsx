"use client";

import { Suspense, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "./nav-icons";
import { NavLinks } from "./nav-links";

/** Closes the drawer when the route changes. usePathname must sit inside Suspense (Cache Components). */
function CloseOnRouteChange({
  dialogRef,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
}) {
  const pathname = usePathname();
  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname, dialogRef]);
  return null;
}

/**
 * Phone-width navigation: a menu button that opens the same links in a native modal `<dialog>`.
 * The browser provides the focus trap, Escape to close, inert background and focus return to the
 * button. It closes on any link click and on route change. There is no animation, so nothing to
 * adjust for reduced motion. `account` is server-rendered content (name and sign-out).
 */
export function MobileNav({ account }: { account: React.ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <Suspense fallback={null}>
        <CloseOnRouteChange dialogRef={dialogRef} />
      </Suspense>
      <Button
        variant="ghost"
        size="sm"
        aria-haspopup="dialog"
        aria-label="Open menu"
        onClick={() => dialogRef.current?.showModal()}
        className="md:hidden"
      >
        <Icon name="menu" className="size-5" />
      </Button>
      <dialog
        ref={dialogRef}
        aria-label="Menu"
        // Click on the backdrop (the dialog element itself) closes it.
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-72 max-w-[85vw] overflow-y-auto border-0 border-r bg-card p-0 text-card-foreground shadow-md backdrop:bg-foreground/40"
      >
        <div className="flex min-h-full flex-col gap-6 p-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-h3 text-foreground">
              JobPilot
            </Link>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Close menu"
              onClick={() => dialogRef.current?.close()}
            >
              <Icon name="close" className="size-5" />
            </Button>
          </div>
          <nav aria-label="Main" onClick={() => dialogRef.current?.close()}>
            <NavLinks />
          </nav>
          <div className="mt-auto">{account}</div>
        </div>
      </dialog>
    </>
  );
}
