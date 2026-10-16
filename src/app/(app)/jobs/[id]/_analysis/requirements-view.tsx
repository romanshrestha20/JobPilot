import { Badge } from "@/components/ui/badge";
import type { AnalysisDto } from "@/features/job-analysis";

type Requirements = NonNullable<AnalysisDto["requirements"]>;

const WORK_MODE_LABELS = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" } as const;

function SkillList({ title, skills }: { title: string; skills: Requirements["requiredSkills"] }) {
  if (skills.length === 0) return null;
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h4 className="text-label font-medium">{title}</h4>
      <ul className="flex flex-col gap-2">
        {skills.map((skill) => (
          // The evidence is text copied from the job description, shown as visible text (not a
          // hover title) so keyboard, touch and screen-reader users can check it. All of it is
          // untrusted and rendered as plain text.
          <li key={skill.key} className="flex min-w-0 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone="tag" className="max-w-full wrap-anywhere">
                {skill.name}
              </Badge>
              {skill.mapped ? null : (
                <span className="text-body-sm text-muted-foreground">not in skill list</span>
              )}
            </span>
            <q className="text-body-sm wrap-anywhere text-muted-foreground">{skill.quote}</q>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** What the analysis found in the job description. Never shows scores or candidate data. */
export function RequirementsView({ requirements }: { requirements: Requirements }) {
  const facts: [string, string][] = [];
  if (requirements.minYearsExperience !== null) {
    facts.push(["Minimum experience", `${requirements.minYearsExperience} years`]);
  }
  if (requirements.workMode) facts.push(["Work mode", WORK_MODE_LABELS[requirements.workMode]]);
  if (requirements.locations.length > 0) {
    facts.push(["Locations", requirements.locations.join(", ")]);
  }
  if (requirements.languages.length > 0) {
    facts.push([
      "Languages",
      requirements.languages
        .map((l) => `${l.language}${l.required ? "" : " (preferred)"}`)
        .join(", "),
    ]);
  }
  const nothingFound =
    facts.length === 0 &&
    requirements.requiredSkills.length === 0 &&
    requirements.preferredSkills.length === 0;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {nothingFound ? (
        <p className="text-body-sm text-muted-foreground">
          No specific requirements were found in this description.
        </p>
      ) : null}
      <SkillList title="Required skills" skills={requirements.requiredSkills} />
      <SkillList title="Preferred skills" skills={requirements.preferredSkills} />
      {facts.length > 0 ? (
        <dl className="grid gap-2 text-body-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-4">
          {facts.map(([term, value]) => (
            <div key={term} className="contents">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="wrap-anywhere">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {requirements.droppedUngrounded > 0 ? (
        <p className="text-body-sm text-muted-foreground">
          {requirements.droppedUngrounded} item
          {requirements.droppedUngrounded === 1 ? "" : "s"} the AI suggested could not be found in
          the description and {requirements.droppedUngrounded === 1 ? "was" : "were"} left out.
        </p>
      ) : null}
    </div>
  );
}
