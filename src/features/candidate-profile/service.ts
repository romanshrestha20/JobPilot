import type { ZodError } from "zod";
import type { CandidateProfileRecord, ProfileRepository } from "./repository";
import { type CandidateProfileDto, type WorkMode, profileInputSchema } from "./validation";

export type UpdateProfileResult =
  { ok: true; profile: CandidateProfileDto } | { ok: false; errors: ZodError["issues"] };

function toDto(record: CandidateProfileRecord): CandidateProfileDto {
  return {
    headline: record.headline,
    summary: record.summary,
    location: record.location,
    yearsOfExperience: record.yearsOfExperience,
    languages: record.languages,
    workModes: record.workModes as WorkMode[],
    updatedAt: record.updatedAt,
  };
}

/**
 * Use cases for the signed-in user's own profile. Callers pass the authenticated user
 * (from `requireUser`); the user id is never taken from request input.
 */
export function createProfileService(repository: ProfileRepository) {
  return {
    async getMyProfile(user: { id: string }): Promise<CandidateProfileDto | null> {
      const record = await repository.findByUserId(user.id);
      return record ? toDto(record) : null;
    },

    async updateMyProfile(user: { id: string }, input: unknown): Promise<UpdateProfileResult> {
      const parsed = profileInputSchema.safeParse(input);
      if (!parsed.success) return { ok: false, errors: parsed.error.issues };

      const record = await repository.upsertForUser(user.id, parsed.data);
      return { ok: true, profile: toDto(record) };
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
