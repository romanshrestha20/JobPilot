import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SkillFormValues } from "../skills/form";
import { SKILL_LEVELS, SKILL_LEVEL_LABELS, SKILL_LIMITS } from "../skills/validation";

/** The four editable skill fields, shared by the add form and the inline edit form. */
export function SkillFields({
  idPrefix,
  values,
  errors,
  autoFocusName = false,
}: {
  idPrefix: string;
  values: SkillFormValues;
  errors: Record<string, string>;
  autoFocusName?: boolean;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id={`${idPrefix}-name`} label="Skill name" error={errors.name}>
          {(control) => (
            <Input
              {...control}
              name="name"
              required
              maxLength={SKILL_LIMITS.nameMax}
              defaultValue={values.name}
              placeholder="TypeScript"
              autoFocus={autoFocusName}
            />
          )}
        </FormField>

        <FormField id={`${idPrefix}-level`} label="Level" error={errors.level}>
          {(control) => (
            <Select {...control} name="level" defaultValue={values.level}>
              <option value="">Not specified</option>
              {SKILL_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {SKILL_LEVEL_LABELS[level]}
                </option>
              ))}
            </Select>
          )}
        </FormField>

        <FormField
          id={`${idPrefix}-years`}
          label="Years with this skill"
          error={errors.yearsOfExperience}
        >
          {(control) => (
            <Input
              {...control}
              name="yearsOfExperience"
              type="number"
              inputMode="numeric"
              min={0}
              max={SKILL_LIMITS.yearsMax}
              step={1}
              defaultValue={values.yearsOfExperience}
            />
          )}
        </FormField>
      </div>

      <FormField
        id={`${idPrefix}-evidence`}
        label="Evidence"
        hint="Optional. A project, work example or achievement that shows this skill."
        error={errors.evidence}
      >
        {(control) => (
          <Textarea
            {...control}
            name="evidence"
            rows={3}
            maxLength={SKILL_LIMITS.evidenceMax}
            defaultValue={values.evidence}
          />
        )}
      </FormField>
    </>
  );
}
