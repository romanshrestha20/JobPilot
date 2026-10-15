import "server-only";
import { db } from "@/lib/db";
import { createProfileRepository } from "./repository";
import { createProfileService } from "./service";
import { createSkillRepository } from "./skills/repository";
import { createSkillService } from "./skills/service";

// Composition root: the only place the concrete database is bound to the use cases.
const service = createProfileService(createProfileRepository(db));
const skills = createSkillService(createSkillRepository(db));

export const getMyProfile = service.getMyProfile;
export const updateMyProfile = service.updateMyProfile;
export const listMySkills = skills.listMySkills;
export const addMySkill = skills.addMySkill;
export const updateMySkill = skills.updateMySkill;
export const removeMySkill = skills.removeMySkill;

export { toFormValues } from "./form";
export type { ProfileFormState, ProfileFormValues } from "./form";
export type { UpdateProfileResult } from "./service";
export type { CandidateProfileDto, ProfileInput, WorkMode } from "./validation";
export type { AddSkillResult, UpdateSkillResult } from "./skills/service";
export type { CandidateSkillDto, SkillInput, SkillLevel } from "./skills/validation";
export { SKILL_LEVELS, SKILL_LEVEL_LABELS, SKILL_LIMITS } from "./skills/validation";
export { ProfileForm } from "./ui/profile-form";
export { SkillsSection } from "./ui/skills-section";
