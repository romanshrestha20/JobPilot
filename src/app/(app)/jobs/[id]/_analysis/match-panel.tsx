import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { linkClass } from "@/components/ui/link";
import { getMyMatch } from "@/features/job-matching";
import { type MatchView, type SkillRow, presentMatch } from "./match-presentation";

function SkillRows({ title, rows }: { title: string; rows: SkillRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="text-label font-medium">{title}</h3>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.key} className="flex min-w-0 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium wrap-anywhere">{row.name}</span>
              <Badge tone={row.stateLabel === "Matched" ? "success" : "neutral"}>
                {row.stateLabel}
              </Badge>
            </span>
            <span className="text-body-sm wrap-anywhere">{row.reason}</span>
            {row.yourEntry ? (
              <span className="text-body-sm text-muted-foreground wrap-anywhere">
                Your entry: {row.yourEntry}
              </span>
            ) : null}
            <q className="text-body-sm text-muted-foreground wrap-anywhere">{row.quote}</q>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Breakdown({ view }: { view: MatchView }) {
  return (
    <>
      <table className="w-full text-body-sm">
        <caption className="sr-only">How each part contributed to the match</caption>
        <thead>
          <tr className="text-left text-muted-foreground">
            <th scope="col" className="py-1 pr-3 font-medium">
              Part
            </th>
            <th scope="col" className="py-1 pr-3 font-medium">
              Weight
            </th>
            <th scope="col" className="py-1 font-medium">
              Result
            </th>
          </tr>
        </thead>
        <tbody>
          {view.components.map((row) => (
            <tr key={row.id} className="border-t border-border align-top">
              <th scope="row" className="py-2 pr-3 text-left font-normal">
                {row.label}
              </th>
              <td className="py-2 pr-3">{row.weightText}</td>
              <td className="py-2">
                {row.resultText}
                {row.note ? (
                  <span className="block text-muted-foreground wrap-anywhere">{row.note}</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <SkillRows title="Required skills" rows={view.required} />
      <SkillRows title="Preferred skills" rows={view.preferred} />
    </>
  );
}

/**
 * "Match with your profile": how much of the extracted requirements the signed-in user's own
 * profile covers (`match-v1`, computed on read, never stored). The profile is read here on the
 * server for the session user only; none of it goes to a model or a queue.
 */
export async function MatchPanel({ userId, jobId }: { userId: string; jobId: string }) {
  const result = await getMyMatch({ id: userId }, jobId);
  if (!result.ok) return null;

  return (
    <div role="region" aria-labelledby="match-heading" className="flex min-w-0 flex-col gap-3">
      <h2 id="match-heading" className="text-h3">
        Match with your profile
      </h2>

      {result.state === "no_completed_analysis" ? (
        <p className="text-body-sm text-muted-foreground">
          Analyse this job to see how your profile matches its requirements.
        </p>
      ) : (
        <MatchBody result={result} />
      )}
    </div>
  );
}

/** Exported for the markup tests; `MatchPanel` is the only caller in the app. */
export function MatchBody({
  result,
}: {
  result: Extract<Awaited<ReturnType<typeof getMyMatch>>, { state: "ready" }>;
}) {
  const view = presentMatch(result.breakdown);
  const scored = view.status === "scored";

  return (
    <>
      {result.stale ? (
        <Alert variant="warning">
          Out of date: the job description changed after the analysis this match is based on. The
          score below describes the older text. Re-run the analysis to update it.
        </Alert>
      ) : null}

      <div className="flex flex-col gap-1">
        <p className="text-h2">
          {scored ? (
            <span className="sr-only">Match score{result.stale ? " (out of date)" : ""}: </span>
          ) : null}
          {view.headline}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {view.label ? <Badge tone="accent">{view.label}</Badge> : null}
          {result.stale ? <Badge tone="warning">Out of date</Badge> : null}
        </div>
        <p className="text-body-sm text-muted-foreground">
          {view.coverageText}. {view.versionText}.
        </p>
      </div>

      {scored ? <p className="text-body-sm">{view.disclaimer}</p> : null}

      {view.status === "insufficient_information" ? (
        <div className="flex flex-col gap-2">
          {view.missingProfile.length > 0 ? (
            <>
              <p className="text-body-sm">Adding this to your profile would help:</p>
              <ul className="list-disc pl-5 text-body-sm">
                {view.missingProfile.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
              <p className="text-body-sm">
                <Link href="/profile" className={linkClass}>
                  Go to your profile
                </Link>
              </p>
            </>
          ) : (
            <p className="text-body-sm">
              This job description does not give enough comparable detail to score.
            </p>
          )}
          {view.jobNotStated.length > 0 ? (
            <ul className="list-disc pl-5 text-body-sm text-muted-foreground">
              {view.jobNotStated.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {view.status === "no_requirements" ? (
        <p className="text-body-sm text-muted-foreground">
          The analysis found no skills, experience, languages, work mode or locations to compare.
        </p>
      ) : null}

      {scored && view.missingProfile.length > 0 ? (
        <Alert variant="info">
          <p>Adding this to your profile would let more of the job be assessed:</p>
          <ul className="list-disc pl-5">
            {view.missingProfile.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
          <p>
            <Link href="/profile" className={linkClass}>
              Go to your profile
            </Link>
          </p>
        </Alert>
      ) : null}

      {view.unmappedNames.length > 0 ? (
        <Alert variant="info">
          <p>
            {view.unmappedNames.length === 1
              ? "1 requirement is"
              : `${view.unmappedNames.length} requirements are`}{" "}
            not in the skill list, so {view.unmappedNames.length === 1 ? "it was" : "they were"} not
            compared and did not lower the score: {view.unmappedNames.join(", ")}. Review{" "}
            {view.unmappedNames.length === 1 ? "it" : "them"} yourself.
          </p>
        </Alert>
      ) : null}

      {view.status !== "no_requirements" ? <Breakdown view={view} /> : null}

      {!scored && view.status === "insufficient_information" ? (
        <p className="text-body-sm text-muted-foreground">{view.disclaimer}</p>
      ) : null}
    </>
  );
}
