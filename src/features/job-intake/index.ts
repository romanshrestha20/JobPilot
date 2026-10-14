import "server-only";
import { db } from "@/lib/db";
import { createJobRepository } from "./repository";
import { createJobService } from "./service";

// Composition root: the only place the concrete database is bound to the use cases.
const service = createJobService(createJobRepository(db));

export const createMyJob = service.createMyJob;
export const listMyJobs = service.listMyJobs;
export const getMyJob = service.getMyJob;
export const deleteMyJob = service.deleteMyJob;

export { JOBS_PAGE_SIZE, parsePage } from "./service";
export type { CreateJobResult, JobsPage } from "./service";
export type { JobFormState, JobFormValues } from "./form";
export type { JobDto, JobSummaryDto } from "./validation";
export { JOB_LIMITS } from "./validation";
export { DeleteJobForm } from "./ui/delete-job-form";
export { JobForm } from "./ui/job-form";
