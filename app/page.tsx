const roadmap = [
  {
    number: "01",
    title: "Foundation",
    description: "Architecture, configuration, data access, authentication, and quality checks.",
    status: "In progress",
  },
  {
    number: "02",
    title: "Job discovery",
    description: "Search, filters, job details, saved roles, imports, and duplicate detection.",
    status: "Planned",
  },
  {
    number: "03",
    title: "Career assistant",
    description: "Candidate profile, CV extraction, explainable matching, and reviewed AI drafts.",
    status: "Planned",
  },
  {
    number: "04",
    title: "Applications",
    description: "Track stages, deadlines, document versions, notes, and follow-ups.",
    status: "Planned",
  },
  {
    number: "05",
    title: "Interview practice",
    description: "Role-specific questions, mock sessions, feedback, and progress history.",
    status: "Planned",
  },
  {
    number: "06",
    title: "Automation",
    description: "Scheduled searches, background processing, and approval-based notifications.",
    status: "Planned",
  },
  {
    number: "07",
    title: "Insights",
    description: "Application metrics, conversion trends, skill gaps, and recommendations.",
    status: "Planned",
  },
];

const principles = [
  "Your data stays under your control",
  "AI suggestions stay reviewable",
  "Features share a stable foundation",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 sm:px-10 lg:px-14">
        <header className="flex items-center justify-between border-b border-[var(--border)] py-6">
          <a href="/" className="flex items-center gap-3" aria-label="JobPilot home">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[var(--accent)] text-sm font-bold text-white">JP</span>
            <span className="text-lg font-semibold tracking-tight">JobPilot</span>
          </a>
          <span className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)]">
            Early development
          </span>
        </header>

        <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div className="max-w-2xl">
            <p className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)]">
              <span className="size-2 rounded-full bg-[var(--accent)]" />
              A clearer way to manage your next move
            </p>
            <h1 className="max-w-xl text-5xl font-semibold leading-[1.05] tracking-[-0.045em] sm:text-6xl">
              Your career search, <span className="text-[var(--accent)]">under control.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--muted)]">
              JobPilot is being built to help you organize opportunities, understand role fit,
              prepare stronger applications, and keep every next step visible.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <a
                href="#roadmap"
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                Explore the roadmap
              </a>
              <a
                href="https://github.com/romanshrestha20/jobpilot"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--border)] px-5 text-sm font-semibold transition hover:bg-[var(--surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                View source code <span aria-hidden="true" className="ml-2">↗</span>
              </a>
            </div>
            <div className="mt-12 grid gap-4 border-t border-[var(--border)] pt-6 sm:grid-cols-3">
              {principles.map((principle) => (
                <div key={principle} className="flex gap-2 text-sm leading-6 text-[var(--muted)]">
                  <span className="mt-1 text-[var(--accent)]" aria-hidden="true">✓</span>
                  <span>{principle}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 rounded-[2rem] bg-[var(--accent-soft)] blur-2xl" aria-hidden="true" />
            <div className="relative rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_24px_80px_rgba(25,45,80,0.09)] sm:p-7">
              <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-5">
                <div>
                  <p className="text-sm text-[var(--muted)]">Workspace preview</p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">Your job search</h2>
                </div>
                <span className="rounded-lg bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--accent)]">Concept</span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
                  <p className="text-xs text-[var(--muted)]">Saved opportunities</p>
                  <p className="mt-2 text-3xl font-semibold">—</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">Planned feature</p>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
                  <p className="text-xs text-[var(--muted)]">Applications</p>
                  <p className="mt-2 text-3xl font-semibold">—</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">Planned feature</p>
                </div>
              </div>
              <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold">Build progress</h3>
                  <span className="text-xs text-[var(--muted)]">Roadmap</span>
                </div>
                <div className="mt-5 space-y-4">
                  {roadmap.slice(0, 4).map((item) => (
                    <div key={item.number} className="flex items-center gap-3">
                      <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${item.number === "01" ? "bg-[var(--accent)] text-white" : "bg-[var(--accent-soft)] text-[var(--accent)]"}`}>
                        {item.number}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{item.description}</p>
                      </div>
                      <span className="text-[10px] font-medium text-[var(--muted)]">{item.status}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
                Preview only. Job counts and application workflows are not connected yet.
              </p>
            </div>
          </div>
        </section>

        <section id="roadmap" className="scroll-mt-8 border-t border-[var(--border)] py-16 sm:py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-[var(--accent)]">The plan</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Built in clear, testable phases.</h2>
            <p className="mt-4 leading-7 text-[var(--muted)]">
              Each phase depends on a reliable foundation. New capabilities should reuse shared
              infrastructure instead of adding another disconnected implementation.
            </p>
          </div>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {roadmap.map((item) => (
              <article key={item.number} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[var(--accent)]">{item.number}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${item.number === "01" ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--background)] text-[var(--muted)]"}`}>
                    {item.status}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="flex flex-col gap-2 border-t border-[var(--border)] py-6 text-sm text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>JobPilot. Career planning with clarity.</p>
          <p>Open development, modular by design.</p>
        </footer>
      </div>
    </main>
  );
}
