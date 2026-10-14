import { cache } from "react";
import { requireUser } from "@/features/identity/server";
import { SignOutButton } from "./sign-out-button";

// One session lookup per request, even though the panel renders in the sidebar and the drawer.
const getAccountUser = cache(() => requireUser());

/** Signed-in user's name and email with the sign-out action. Reads the session: use inside Suspense. */
export async function AccountPanel() {
  const user = await getAccountUser();
  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <div className="flex min-w-0 flex-col gap-0.5 wrap-anywhere">
        <p className="text-label text-foreground">{user.name}</p>
        <p className="text-caption text-muted-foreground">{user.email}</p>
      </div>
      <SignOutButton />
    </div>
  );
}
