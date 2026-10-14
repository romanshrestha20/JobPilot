"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/components/auth/auth-client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    await signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      onClick={handleClick}
      className="w-full"
    >
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
