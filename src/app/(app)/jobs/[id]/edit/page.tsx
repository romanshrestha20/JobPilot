import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LoadingState } from "@/components/layout/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { JobForm, getMyJob, toJobFormValues } from "@/features/job-intake";
import { requireUser } from "@/features/identity/server";

export const metadata = { title: "Edit job · JobPilot" };

type Props = { params: Promise<{ id: string }> };

export default function EditJobPage({ params }: Props) {
  return (
    <PageShell>
      <Suspense fallback={<LoadingState label="Loading job…" />}>
        <EditJobContent params={params} />
      </Suspense>
    </PageShell>
  );
}

async function EditJobContent({ params }: Props) {
  const user = await requireUser();
  const { id } = await params;
  // Scoped to the signed-in user in SQL; a missing, malformed and foreign id are all a plain 404.
  const job = await getMyJob(user, id);
  if (!job) notFound();

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "My jobs", href: "/jobs" },
          { label: job.title, href: `/jobs/${job.id}` },
          { label: "Edit" },
        ]}
        title="Edit job"
        description={[job.title, job.company].join(" · ")}
      />
      <Card>
        <CardContent>
          <JobForm job={{ id: job.id, values: toJobFormValues(job) }} />
        </CardContent>
      </Card>
    </>
  );
}
