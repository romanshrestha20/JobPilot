"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";
import { nextPollDelay } from "./polling";

/**
 * Renders nothing. While an analysis is queued or running it re-renders the page from the server
 * on a schedule, so the panel moves to its next state without a reload. It pauses while the tab
 * is hidden and stops when the panel stops rendering it (the run finished) or after the give-up
 * time.
 */
export function AnalysisPoller() {
  const router = useRouter();

  useEffect(() => {
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      const delay = nextPollDelay(Date.now() - startedAt);
      if (delay === null) return;
      timer = setTimeout(() => {
        if (!document.hidden) startTransition(() => router.refresh());
        schedule();
      }, delay);
    };
    const onVisible = () => {
      if (!document.hidden) startTransition(() => router.refresh());
    };

    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
