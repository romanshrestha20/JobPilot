import "server-only";
import { db } from "@/lib/db";
import { createJobRepository } from "./repository";
import { createJobService } from "./service";

// Composition root: the only place the concrete database is bound to the use cases.
const service = createJobService(createJobRepository(db));

export const createMyJob = service.createMyJob;
export const listMyJobs = service.listMyJobs;
export const getMyJob = service.getMyJob;
export const updateMyJob = service.updateMyJob;
export const updateMyJobStatus = service.updateMyJobStatus;
export const deleteMyJob = service.deleteMyJob;

export { JOBS_PAGE_SIZE, parsePage } from "./service";
export type { CreateJobResult, JobsPage, UpdateJobResult, UpdateJobStatusResult } from "./service";
export { toJobFormValues } from "./form";
export type { JobFormState, JobFormValues, JobStatusFormState } from "./form";
export type { JobDto, JobStatus, JobSummaryDto } from "./validation";
export { JOB_LIMITS, JOB_STATUSES, JOB_STATUS_LABELS, parseJobStatus } from "./validation";
export { DeleteJobForm } from "./ui/delete-job-form";
export { JobForm } from "./ui/job-form";
export { JobStatusBadge } from "./ui/job-status-badge";
export { JobStatusForm } from "./ui/job-status-form";
