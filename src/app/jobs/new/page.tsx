import { Suspense } from "react";
import { LoadingState } from "@/components/layout/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { JobForm } from "@/features/job-intake";
import { requireUser } from "@/features/identity/server";

export const metadata = { title: "Add a job · JobPilot" };

export default function NewJobPage() {
  return (
    <PageShell>
      <PageHeader title="Add a job" description="Save a posting by pasting its details." />
      <Suspense fallback={<LoadingState label="Loading…" />}>
        <NewJobContent />
      </Suspense>
    </PageShell>
  );
}

// Signed-out visitors are redirected here too; the proxy is only the first, optimistic check.
async function NewJobContent() {
  await requireUser();
  return (
    <Card>
      <CardContent>
        <JobForm />
      </CardContent>
    </Card>
  );
}
