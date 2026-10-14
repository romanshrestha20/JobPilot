import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <PageShell centered className="flex flex-col items-center gap-4 text-center">
      <h1 className="text-display">JobPilot</h1>
      <p className="text-body text-muted-foreground">AI-powered job search assistant</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Link href="/jobs/new" className={buttonVariants()}>
          Add a job
        </Link>
        <Link href="/jobs" className={buttonVariants({ variant: "secondary" })}>
          View saved jobs
        </Link>
      </div>
    </PageShell>
  );
}
