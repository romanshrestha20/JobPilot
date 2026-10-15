/** String-only shape used to populate and echo the skill forms. */
export type SkillFormValues = {
  name: string;
  level: string;
  yearsOfExperience: string;
  evidence: string;
};

export type SkillFormState =
  | { status: "idle"; values: SkillFormValues }
  | { status: "success"; values: SkillFormValues; message: string }
  | {
      status: "error";
      values: SkillFormValues;
      fieldErrors: Record<string, string>;
      /** An error that belongs to no single field, e.g. the skill limit. */
      formError?: string;
    };

export const EMPTY_SKILL_FORM_VALUES: SkillFormValues = {
  name: "",
  level: "",
  yearsOfExperience: "",
  evidence: "",
};

const text = (formData: FormData, key: string): string => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

export function readSkillForm(formData: FormData): SkillFormValues {
  return {
    name: text(formData, "name"),
    level: text(formData, "level"),
    yearsOfExperience: text(formData, "yearsOfExperience"),
    evidence: text(formData, "evidence"),
  };
}

/** Form values for editing a stored skill. */
export function toSkillFormValues(skill: {
  name: string;
  level: string | null;
  yearsOfExperience: number | null;
  evidence: string | null;
}): SkillFormValues {
  return {
    name: skill.name,
    level: skill.level ?? "",
    yearsOfExperience: skill.yearsOfExperience === null ? "" : String(skill.yearsOfExperience),
    evidence: skill.evidence ?? "",
  };
}

/**
 * Builds the raw input for the skill service from named form fields only, so unexpected
 * fields (including `userId`, `skillKey` and `id`) are never forwarded. The service's Zod
 * schema does the real validation.
 */
export function parseSkillForm(formData: FormData): unknown {
  const values = readSkillForm(formData);
  const years = values.yearsOfExperience.trim();
  const level = values.level === "" ? null : values.level;
  return {
    name: values.name,
    level,
    yearsOfExperience: years === "" ? null : Number(years),
    evidence: values.evidence,
  };
}
