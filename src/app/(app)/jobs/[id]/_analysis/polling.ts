/**
 * Polling policy for an active analysis. The page re-renders on the server (`router.refresh()`),
 * so ownership and state always come from the database, never from the client. Pure so the
 * schedule is unit-tested.
 */
const FAST_MS = 2_000;
const SLOW_MS = 5_000;
const FAST_FOR_MS = 30_000;
/** Stop polling after this long; the user can reload. Longer than three attempts with backoff. */
export const POLL_GIVE_UP_MS = 10 * 60_000;

/** Delay before the next refresh, or null to stop polling. */
export function nextPollDelay(elapsedMs: number): number | null {
  if (elapsedMs >= POLL_GIVE_UP_MS) return null;
  return elapsedMs < FAST_FOR_MS ? FAST_MS : SLOW_MS;
}
