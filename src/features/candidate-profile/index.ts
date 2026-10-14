import "server-only";
import { db } from "@/lib/db";
import { createProfileRepository } from "./repository";
import { createProfileService } from "./service";

// Composition root: the only place the concrete database is bound to the use cases.
const service = createProfileService(createProfileRepository(db));

export const getMyProfile = service.getMyProfile;
export const updateMyProfile = service.updateMyProfile;

export { toFormValues } from "./form";
export type { ProfileFormState, ProfileFormValues } from "./form";
export type { UpdateProfileResult } from "./service";
export type { CandidateProfileDto, ProfileInput, WorkMode } from "./validation";
export { ProfileForm } from "./ui/profile-form";
