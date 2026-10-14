import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LoadingState } from "@/components/layout/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteJobForm, getMyJob } from "@/features/job-intake";
import { requireUser } from "@/features/identity/server";

export const metadata = { title: "Job · JobPilot" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default function JobPage({ params, searchParams }: Props) {
  return (
    <PageShell>
      <Suspense fallback={<LoadingState label="Loading job…" />}>
        <JobContent params={params} searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function JobContent({ params, searchParams }: Props) {
  const user = await requireUser();
  const { id } = await params;
  const { saved } = await searchParams;
  // Scoped to the signed-in user in SQL; a missing and a foreign job are both a plain 404.
  const job = await getMyJob(user, id);
  if (!job) notFound();

  return (
    <>
      <PageHeader
        title={job.title}
        description={[job.company, job.location].filter(Boolean).join(" · ")}
        actions={
          <Link href="/jobs" className={buttonVariants({ variant: "secondary" })}>
            All jobs
          </Link>
        }
      />
      {saved === "1" && (
        <div className="mb-4">
          <Alert variant="success">Job saved.</Alert>
        </div>
      )}
      <Card>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid gap-2 text-body-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-4">
            <dt className="text-muted-foreground">Saved</dt>
            <dd>
              {job.createdAt.toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}
            </dd>
            {job.sourceUrl ? (
              <>
                <dt className="text-muted-foreground">Original posting</dt>
                <dd className="wrap-anywhere">
                  <a
                    href={job.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="font-medium text-primary underline underline-offset-4"
                  >
                    {job.sourceUrl}
                  </a>
                </dd>
              </>
            ) : null}
          </dl>
          <section aria-labelledby="description-heading" className="flex flex-col gap-2">
            <h2 id="description-heading" className="text-h3">
              Description
            </h2>
            {/* Untrusted text: rendered as plain text (React escapes it), never as HTML. */}
            <p className="whitespace-pre-wrap wrap-anywhere text-body">{job.description}</p>
          </section>
        </CardContent>
      </Card>
      <div className="mt-6">
        <DeleteJobForm jobId={job.id} />
      </div>
    </>
  );
}
