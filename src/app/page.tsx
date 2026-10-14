import { PageShell } from "@/components/layout/page-shell";

export default function Home() {
  return (
    <PageShell centered className="flex flex-col items-center gap-4 text-center">
      <h1 className="text-display">JobPilot</h1>
      <p className="text-body text-muted-foreground">AI-powered job search assistant</p>
    </PageShell>
  );
}
