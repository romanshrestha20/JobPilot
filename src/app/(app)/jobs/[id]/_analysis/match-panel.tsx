import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { linkClass } from "@/components/ui/link";
import { getMyMatch } from "@/features/job-matching";
import { type MatchView, type SkillGroup, presentMatch } from "./match-presentation";

const CHIP_TONES: Record<SkillGroup["state"], NonNullable<BadgeProps["tone"]>> = {
  matched: "success",
  listed: "neutral",
  absent: "tag",
  no_profile_skills: "tag",
  unmapped: "tag",
};

/** One list of skills, grouped by state so each state and its explanation appears once. */
function SkillGroups({ title, groups }: { title: string; groups: SkillGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h3 className="text-h3">{title}</h3>
      {groups.map((group) => (
        <div key={group.state} className="flex min-w-0 flex-col gap-2">
          <p className="text-body">
            <span className="font-medium">{group.label}</span>
            <span className="text-muted-foreground"> · {group.reason}</span>
          </p>
          <ul className="flex flex-wrap gap-2">
            {group.skills.map((skill) => (
              <li key={skill.key} className="min-w-0 max-w-full">
                <Badge tone={CHIP_TONES[group.state]} className="max-w-full py-1 wrap-anywhere">
                  {skill.name}
                  {skill.detail ? (
                    <span className="font-normal opacity-80"> ({skill.detail})</span>
                  ) : null}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function PartsTable({ view, open }: { view: MatchView; open: boolean }) {
  return (
    <details open={open} className="rounded-md border border-border px-4 py-3">
      <summary className="cursor-pointer text-body font-medium">How each part contributed</summary>
      <table className="mt-3 w-full text-body">
        <caption className="sr-only">How each part contributed to the match</caption>
        <thead>
          <tr className="text-left text-body-sm text-muted-foreground">
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
                  <span className="block text-body-sm text-muted-foreground wrap-anywhere">
                    {row.note}
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
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
    <div role="region" aria-labelledby="match-heading" className="flex min-w-0 flex-col gap-4">
      <h2 id="match-heading" className="text-h2">
        Match with your profile
      </h2>

      {result.state === "no_completed_analysis" ? (
        <p className="text-body text-muted-foreground">
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
  const needsProfile = view.missingProfile.length > 0;

  return (
    <>
      {result.stale ? (
        <Alert variant="warning">
          Out of date: the job description changed after the analysis this match is based on. The
          score below describes the older text. Re-run the analysis to update it.
        </Alert>
      ) : null}

      {/* Summary: the number (or why there is none), its label, and how much it rests on. */}
      <div className="flex flex-col gap-2 rounded-md bg-muted px-4 py-4">
        <p className="text-h1">
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

      {view.status === "no_requirements" ? (
        <p className="text-body text-muted-foreground">
          The analysis found no skills, experience, languages, work mode or locations to compare.
        </p>
      ) : null}

      {view.status === "insufficient_information" && !needsProfile ? (
        <p className="text-body">
          This job description does not give enough comparable detail to score.
        </p>
      ) : null}

      {needsProfile ? (
        <Alert variant="info">
          <p>
            {scored
              ? "Adding this to your profile would let more of the job be assessed:"
              : "Adding this to your profile would help:"}
          </p>
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

      {view.jobNotStated.length > 0 && !scored ? (
        <p className="text-body-sm text-muted-foreground">
          The job {view.jobNotStated.map(withoutSubject).join("; ")}.
        </p>
      ) : null}

      {view.status !== "no_requirements" ? (
        <>
          <PartsTable view={view} open={!scored} />
          <SkillGroups title="Required skills" groups={view.required} />
          <SkillGroups title="Preferred skills" groups={view.preferred} />
        </>
      ) : null}

      <p className="text-body-sm text-muted-foreground">{view.disclaimer}</p>
    </>
  );
}

/** "The job does not state a work mode" -> "does not state a work mode", for one joined sentence. */
function withoutSubject(text: string): string {
  return text.replace(/^The job /, "");
}
