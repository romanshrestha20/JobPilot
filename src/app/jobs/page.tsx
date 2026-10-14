import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoadingState } from "@/components/layout/loading-state";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  JobStatusBadge,
  listMyJobs,
  parseJobStatus,
  parsePage,
  type JobStatus,
} from "@/features/job-intake";
import { requireUser } from "@/features/identity/server";

export const metadata = { title: "Saved jobs · JobPilot" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** `/jobs` URL for a filter and page. Changing the filter never carries a page over. */
function jobsHref({ status, page }: { status?: JobStatus; page?: number }) {
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (page && page > 1) query.set("page", String(page));
  const search = query.toString();
  return search ? `/jobs?${search}` : "/jobs";
}

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

function StatusFilter({ current }: { current?: JobStatus }) {
  return (
    <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
      <Link
        href={jobsHref({})}
        aria-current={current ? undefined : "page"}
        className={buttonVariants({ variant: current ? "secondary" : "primary", size: "sm" })}
      >
        All
      </Link>
      {JOB_STATUSES.map((status) => (
        <Link
          key={status}
          href={jobsHref({ status })}
          aria-current={current === status ? "page" : undefined}
          className={buttonVariants({
            variant: current === status ? "primary" : "secondary",
            size: "sm",
          })}
        >
          {JOB_STATUS_LABELS[status]}
        </Link>
      ))}
    </nav>
  );
}

// Reads the session, so it streams in behind the Suspense boundary (Cache Components).
async function JobsContent({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await searchParams;
  // An unknown ?status= is treated as "all", never passed to the database.
  const status = parseJobStatus(first(params.status));
  const { jobs, page, hasMore } = await listMyJobs(user, parsePage(first(params.page)), status);

  // A page past the end (e.g. after switching filter by hand) goes back to the first page.
  if (jobs.length === 0 && page > 1) redirect(jobsHref({ status }));

  const deleted = params.deleted === "1" && <Alert variant="success">Job deleted.</Alert>;

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {deleted}
        <StatusFilter current={status} />
        {status ? (
          <EmptyState
            title={`No ${JOB_STATUS_LABELS[status].toLowerCase()} jobs`}
            description="Change a job's status from its page, or show every job."
            action={
              <Link href={jobsHref({})} className={buttonVariants({ variant: "secondary" })}>
                Show all jobs
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="No saved jobs yet"
            description="Paste a job posting to keep it here with its full description."
            action={
              <Link href="/jobs/new" className={buttonVariants()}>
                Add your first job
              </Link>
            }
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {deleted}
      <StatusFilter current={status} />
      <ul className="flex flex-col gap-6">
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
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <JobStatusBadge status={job.status} />
                  <p className="text-body-sm text-muted-foreground">
                    {[
                      job.location,
                      `Saved ${job.createdAt.toLocaleDateString("en", { dateStyle: "medium" })}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {(page > 1 || hasMore) && (
        <nav aria-label="Pagination" className="flex items-center justify-between">
          {page > 1 ? (
            <Link
              href={jobsHref({ status, page: page - 1 })}
              className={buttonVariants({ variant: "secondary" })}
            >
              Newer
            </Link>
          ) : (
            <span />
          )}
          {hasMore ? (
            <Link
              href={jobsHref({ status, page: page + 1 })}
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
