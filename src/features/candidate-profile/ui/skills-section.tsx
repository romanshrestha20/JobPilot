import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { type CandidateSkillDto, SKILL_LIMITS } from "../skills/validation";
import { AddSkillForm } from "./add-skill-form";
import { SKILLS_HEADING_ID, SkillItem } from "./skill-item";

/** The signed-in user's skills: add form, then the list with inline edit and remove. */
export function SkillsSection({ skills }: { skills: CandidateSkillDto[] }) {
  const atLimit = skills.length >= SKILL_LIMITS.maxSkills;

  return (
    <Card role="region" aria-labelledby={SKILLS_HEADING_ID}>
      <CardHeader>
        <CardTitle id={SKILLS_HEADING_ID} tabIndex={-1} className="outline-none">
          Skills
        </CardTitle>
        <CardDescription>
          Add the skills you want job matches to consider. Level, years and evidence are optional.
          <span className="ml-1 whitespace-nowrap font-mono">
            ({skills.length} of {SKILL_LIMITS.maxSkills})
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {atLimit ? (
          <Alert variant="info">
            You have reached the limit of {SKILL_LIMITS.maxSkills} skills. Remove one to add
            another.
          </Alert>
        ) : (
          <AddSkillForm />
        )}
        <Separator />
        {skills.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">
            No skills yet. Add your first skill above.
          </p>
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Your skills">
            {skills.map((skill) => (
              <SkillItem key={skill.id} skill={skill} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
