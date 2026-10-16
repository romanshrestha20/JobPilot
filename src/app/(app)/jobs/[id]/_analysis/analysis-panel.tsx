import Link from "next/link";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { type AnalysisDto, DEMO_LABEL } from "@/features/job-analysis";
import { AnalysisPoller } from "./analysis-poller";
import { EDIT_THEN_RETRY, FAILURE_MESSAGES } from "./messages";
import { RequestAnalysisForm } from "./request-form";
import { RequirementsView } from "./requirements-view";
import { getAnalysisService } from "./server";

const MAX_ATTEMPTS_LABEL = 3;

function Progress({ analysis }: { analysis: AnalysisDto }) {
  const queued = analysis.status === "pending";
  const retrying = analysis.attempts > 1;
  return (
    <div className="flex items-center gap-3 text-body-sm" role="status" aria-live="polite">
      <Spinner label="" />
      <span>
        {queued
          ? retrying
            ? "Waiting to retry the analysis…"
            : "Waiting to start the analysis…"
          : retrying
            ? `Analysing the job description (attempt ${analysis.attempts} of ${MAX_ATTEMPTS_LABEL})…`
            : "Analysing the job description…"}
      </span>
    </div>
  );
}

function Failure({ analysis, jobId }: { analysis: AnalysisDto; jobId: string }) {
  const code = analysis.failureCode;
  const message = code ? FAILURE_MESSAGES[code] : "The analysis failed. Nothing was saved.";
  const editFirst = code !== null && EDIT_THEN_RETRY.includes(code);
  return (
    <div className="flex flex-col gap-3">
      <Alert variant="destructive">
        <AlertTitle>Analysis failed</AlertTitle>
        <p>{message}</p>
      </Alert>
      {analysis.canRetry ? <RequestAnalysisForm jobId={jobId} label="Retry analysis" /> : null}
      {editFirst ? (
        <div className="flex flex-wrap items-start gap-3">
          <Link href={`/jobs/${jobId}/edit`} className={buttonVariants({ variant: "secondary" })}>
            Edit job
          </Link>
          <RequestAnalysisForm jobId={jobId} label="Analyse again" variant="secondary" />
        </div>
      ) : null}
    </div>
  );
}

function Result({
  analysis,
  stale,
  previous,
}: {
  analysis: AnalysisDto;
  stale: boolean;
  previous: boolean;
}) {
  if (!analysis.requirements) return null;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {previous ? <Badge tone="neutral">Previous result</Badge> : null}
        {analysis.demo ? <Badge tone="warning">{DEMO_LABEL}</Badge> : null}
        {stale ? <Badge tone="warning">Out of date</Badge> : null}
        {analysis.completedAt ? (
          <span className="text-body-sm text-muted-foreground">
            {analysis.completedAt.toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}
          </span>
        ) : null}
      </div>
      <RequirementsView requirements={analysis.requirements} />
    </div>
  );
}

/**
 * The "Job requirements" region of the job page (a div, not a section, so it never matches the existing description selectors). Rendered on the server for the signed-in user:
 * the view is read through the owner-scoped service, so a foreign job never gets here. While a
 * run is queued or running it mounts the poller; when the run ends the poller disappears.
 */
export async function AnalysisPanel({ userId, jobId }: { userId: string; jobId: string }) {
  const view = await getAnalysisService().getMyAnalysisView({ id: userId }, jobId);
  if (!view) return null;
  const { latest, current, stale } = view;
  const active = latest?.status === "pending" || latest?.status === "processing";

  return (
    <div role="region" aria-labelledby="analysis-heading" className="flex min-w-0 flex-col gap-3">
      <h2 id="analysis-heading" className="text-h3">
        Job requirements
      </h2>

      {latest === null ? (
        <div className="flex flex-col gap-3">
          <p className="text-body-sm text-muted-foreground">
            Analyse this description to list the skills and conditions it asks for. Only the job
            text is sent to the AI, never your profile.
          </p>
          <RequestAnalysisForm jobId={jobId} label="Analyse job" />
        </div>
      ) : null}

      {latest && active ? (
        <>
          <Progress analysis={latest} />
          <AnalysisPoller />
        </>
      ) : null}

      {latest?.status === "failed" ? <Failure analysis={latest} jobId={jobId} /> : null}

      {latest?.status === "completed" ? (
        <>
          <Result analysis={latest} stale={stale} previous={false} />
          {stale ? (
            <div className="flex flex-col gap-2">
              <Alert variant="warning">
                The description changed after this analysis. Run it again to update it.
              </Alert>
              <RequestAnalysisForm jobId={jobId} label="Re-run analysis" variant="secondary" />
            </div>
          ) : (
            <RequestAnalysisForm jobId={jobId} label="Re-run analysis" variant="secondary" />
          )}
        </>
      ) : null}

      {/* A newer run is in flight or failed: keep showing the last good result beside it. */}
      {latest && latest.status !== "completed" && current ? (
        <Result analysis={current} stale={stale} previous />
      ) : null}
    </div>
  );
}
