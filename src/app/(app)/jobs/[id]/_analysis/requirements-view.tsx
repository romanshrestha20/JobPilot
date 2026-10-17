import { Badge } from "@/components/ui/badge";
import type { AnalysisDto } from "@/features/job-analysis";

type Requirements = NonNullable<AnalysisDto["requirements"]>;
type Skills = Requirements["requiredSkills"];

const WORK_MODE_LABELS = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" } as const;

function SkillBadges({ title, skills }: { title: string; skills: Skills }) {
  if (skills.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="text-h3">{title}</h3>
      <ul className="flex flex-wrap gap-2">
        {skills.map((skill) => (
          <li key={skill.key} className="min-w-0 max-w-full">
            {/* Untrusted text from the job description: rendered as plain text. */}
            <Badge tone="tag" className="max-w-full text-body wrap-anywhere">
              {skill.name}
              {skill.mapped ? null : (
                <span className="font-normal text-muted-foreground"> · not in skill list</span>
              )}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The evidence for each skill: the sentence of the job description it came from. A native
 * disclosure, so it works by keyboard, by touch and with a screen reader, and keeps the skill
 * list short. Everything inside is untrusted text and rendered as plain text.
 */
function Evidence({ required, preferred }: { required: Skills; preferred: Skills }) {
  const all = [...required, ...preferred];
  if (all.length === 0) return null;
  return (
    <details className="rounded-md border border-border px-4 py-3">
      <summary className="cursor-pointer text-body font-medium">
        Show where each skill appears in the description
      </summary>
      <ul className="mt-3 flex flex-col gap-3">
        {all.map((skill, index) => (
          <li key={`${skill.key}-${index}`} className="flex min-w-0 flex-col gap-1 text-body">
            <span className="font-medium wrap-anywhere">{skill.name}</span>
            <q className="text-muted-foreground wrap-anywhere">{skill.quote}</q>
          </li>
        ))}
      </ul>
    </details>
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
        <p className="text-body text-muted-foreground">
          No specific requirements were found in this description.
        </p>
      ) : null}
      <SkillBadges title="Required skills" skills={requirements.requiredSkills} />
      <SkillBadges title="Preferred skills" skills={requirements.preferredSkills} />
      {facts.length > 0 ? (
        <dl className="grid gap-2 text-body sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-4">
          {facts.map(([term, value]) => (
            <div key={term} className="contents">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="wrap-anywhere">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <Evidence required={requirements.requiredSkills} preferred={requirements.preferredSkills} />
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
