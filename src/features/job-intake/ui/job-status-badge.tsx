import { Badge, type BadgeProps } from "@/components/ui/badge";
import { JOB_STATUS_LABELS, type JobStatus } from "../validation";

// Semantic tones only. The label always prints the status, so colour never carries it alone.
const TONES: Record<JobStatus, NonNullable<BadgeProps["tone"]>> = {
  saved: "neutral",
  applied: "info",
  interviewing: "accent",
  offered: "success",
  rejected: "danger",
  withdrawn: "tag",
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge tone={TONES[status]}>{JOB_STATUS_LABELS[status]}</Badge>;
}
