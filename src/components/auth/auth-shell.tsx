import type * as React from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";

export interface AuthShellProps {
  title: string;
  /** Link to the sibling auth screen, rendered under the form. */
  footer: React.ReactNode;
  children: React.ReactNode;
}

/** Shared frame for the sign-in and sign-up screens. */
export function AuthShell({ title, footer, children }: AuthShellProps) {
  return (
    <PageShell width="narrow" centered>
      <h1 className="mb-6 text-h1">{title}</h1>
      <Card>
        <CardContent>{children}</CardContent>
      </Card>
      <p className="mt-6 text-center text-body-sm text-muted-foreground">{footer}</p>
    </PageShell>
  );
}
