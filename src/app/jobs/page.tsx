import { Suspense } from "react";
import Link from "next/link";
import { LoadingState } from "@/components/layout/loading-state";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listMyJobs, parsePage } from "@/features/job-intake";
import { requireUser } from "@/features/identity/server";

export const metadata = { title: "Saved jobs · JobPilot" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default function JobsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <PageHeader
        title="Saved jobs"
        actions={
          <Link href="/jobs/new" className={buttonVariants()}>
            Add job
          </Link>
        }
      />
      <Suspense fallback={<LoadingState label="Loading your jobs…" />}>
        <JobsContent searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

// Reads the session, so it streams in behind the Suspense boundary (Cache Components).
async function JobsContent({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await searchParams;
  const requestedPage = Array.isArray(params.page) ? params.page[0] : params.page;
  const { jobs, page, hasMore } = await listMyJobs(user, parsePage(requestedPage));

  if (jobs.length === 0 && page === 1) {
    return (
      <>
        {params.deleted === "1" && <Alert variant="success">Job deleted.</Alert>}
        <EmptyState
          title="No saved jobs yet"
          description="Paste a job posting to keep it here with its full description."
          action={
            <Link href="/jobs/new" className={buttonVariants()}>
              Add your first job
            </Link>
          }
        />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {params.deleted === "1" && <Alert variant="success">Job deleted.</Alert>}
      <ul className="flex flex-col gap-4">
        {jobs.map((job) => (
          <li key={job.id}>
            <Card>
              <CardContent className="flex flex-col gap-1">
                <h2 className="text-h3">
                  <Link href={`/jobs/${job.id}`} className="underline-offset-4 hover:underline">
                    {job.title}
                  </Link>
                </h2>
                <p className="text-body text-foreground">{job.company}</p>
                <p className="text-body-sm text-muted-foreground">
                  {[
                    job.location,
                    `Saved ${job.createdAt.toLocaleDateString("en", { dateStyle: "medium" })}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {(page > 1 || hasMore) && (
        <nav aria-label="Pagination" className="flex items-center justify-between">
          {page > 1 ? (
            <Link
              href={page === 2 ? "/jobs" : `/jobs?page=${page - 1}`}
              className={buttonVariants({ variant: "secondary" })}
            >
              Newer
            </Link>
          ) : (
            <span />
          )}
          {hasMore ? (
            <Link
              href={`/jobs?page=${page + 1}`}
              className={buttonVariants({ variant: "secondary" })}
            >
              Older
            </Link>
          ) : null}
        </nav>
      )}
    </div>
  );
}
