import { Spinner } from "@/components/ui/spinner";

export interface LoadingStateProps {
  label?: string;
}

/** Suspense fallback for a section: spinner plus a visible label. */
export function LoadingState({ label = "Loading…" }: LoadingStateProps) {
  return (
    <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
      <Spinner label="" />
      <span role="status">{label}</span>
    </div>
  );
}
