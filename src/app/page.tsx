import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <PageShell centered className="flex flex-col items-center gap-4 text-center">
      <h1 className="text-display">JobPilot</h1>
      <p className="text-body text-muted-foreground">AI-powered job search assistant</p>
      <nav aria-label="Main" className="mt-2 flex flex-wrap justify-center gap-2">
        <Link href="/jobs" className={buttonVariants()}>
          Saved jobs
        </Link>
        <Link href="/profile" className={buttonVariants({ variant: "secondary" })}>
          Your profile
        </Link>
      </nav>
    </PageShell>
  );
}
