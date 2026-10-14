# JobPilot Design System

Design reference for the JobPilot UI. Built for Next.js + Tailwind CSS v4 + shadcn/ui, with Geist and Geist Mono (already loaded in `src/app/layout.tsx`). Token names follow shadcn/ui and are implemented in `src/app/globals.css`, which is the executable source of truth (see _Implementation status_).

Principle: **the AI proposes, the user decides.** A warm, calm surface (Warm Ivory in light, Night Ink in dark), one confident Muted Copper for direction (`primary`), and Antique Gold (`beacon`) only where AI has been at work.

JobPilot is a calm co-pilot for a stressful task. The interface should feel like a well-kept instrument panel: quiet warm neutrals, one copper accent for direction, and gold that lights up only where the AI has been at work. The user is always the pilot — the AI proposes, the person decides.

## Color guidelines

- Brand palette. Light: Warm Ivory `#faf5ef` (`background`), Linen `#e8d8c7` (`secondary`, `border`), Muted Copper `#b65d45` (`primary`), Antique Gold `#d6b45a` (`beacon`), Charcoal `#292a30` (`foreground`). Dark: Night Ink `#191a1e` (`background`), Graphite `#25252a` (`card`), Copper Glow `#d47a60` (`primary`), Soft Gold `#e1c477` (`beacon`), Ivory Text `#f4ede5` (`foreground`). Every other token is derived from these to meet contrast.
- Build every screen on `background`, with content on `card` and overlays on `popover`. Text is `foreground`; secondary text is `muted-foreground`.
- `primary` (copper) is the brand fill and the direction: the single primary button, the focus ring, the active filter chip. **Copper as text on Ivory is 4.2:1 and fails AA**, so text and links in the brand colour use `primary-strong` (`linkClass`), never `primary`. Do not use copper for decoration.
- `beacon` (gold) means **AI**, and only AI: the spark glyph, _Drafted by AI_ tags, the `ai` button. If something is amber and not AI, it is `warning`, a darker token.
- Job statuses are labelled by `Badge` tones and always print the status word; the `status-*` tokens are reserved for the pipeline view.
- Match scores use `match-high` / `match-mid` / `match-low` bands at 75 and 50 (reserved for `MatchScore`). Low is grey: a weak match is information, not failure.
- `destructive` (crimson, deliberately a different hue from copper) is for errors and irreversible actions only. State is never colour alone: alerts carry an icon shape per variant, badges and links carry words or underlines.
- Both themes are first-class. Every text pairing holds 4.5:1 and control borders and the focus ring hold 3:1 (see _Verified contrast_).

## Type guidelines

- Geist for everything, Geist Mono for data. In the repo they are already loaded through `next/font` as `--font-geist-sans` and `--font-geist-mono`; map them to `--font-sans` and `--font-mono`.
- Reading text is `body` (15/24). Dense lists and tables use `body-sm`. Controls use `label`.
- Headings: `h1` page title, `h2` section, `h3` card title. `display` appears at most once per screen (dashboard greeting, empty states).
- Numbers that users compare — scores, salaries, dates in tables, KPIs — are set in `score` or `mono` with tabular figures.
- Use `eyebrow` above a section to name it in capitals: _MATCH BREAKDOWN_, _INTERVIEW PREP_.

## Spacing, radius, elevation

- A 4px grid: `space-1` through `space-12`. Cards pad `space-6`; cards stack `space-6` apart; page gutters are `space-8` on desktop and `space-4` on mobile.
- Corners: `radius-sm` badges and checkboxes, `radius-md` buttons and inputs, `radius-lg` cards and dialogs (this is shadcn's `--radius`). `radius-full` only for dots and avatars.
- Separate with `border` hairlines first; `shadow-sm` for cards at rest, `shadow-md` only for things that float (menus, dialogs, a dragged pipeline card). No gradients.

## Layout

- App shell: every signed-in route sits in the shell from `src/app/(app)/layout.tsx` — a 240px left sidebar from `md` (768px) up, a top bar, and the page content on `background`, max content width 1200px. Sign-in and sign-up are outside it. See _Navigation_.
- Lists of jobs use `JobCard`; the application pipeline is five columns in status order (Saved → Applied → Interview → Offer → Rejected).
- Every AI result appears inside `AISuggestion` with _Use this_, _Edit_ and _Discard_. Nothing generated is saved or sent without a click from the user.

## Interaction and states

- Focus: a 2px solid `ring` outline with 2px offset on every interactive element, both themes.
- Hover darkens fills (`primary` → `accent-foreground`) or adds an `accent` ground to rows. Disabled is 50% opacity with a not-allowed cursor.
- Loading: skeletons on `muted` for lists; a streaming AI draft fills the `AISuggestion` body as it arrives, with actions disabled until it completes.
- Motion is short and functional: 150ms colour transitions, 200ms for panels. Respect `prefers-reduced-motion`.

## Iconography

- Use Lucide icons (shadcn's default) at 16px in controls and 20px in navigation, 1.5px stroke, `currentColor`.
- The AI spark is JobPilot's own four-point star, drawn in `beacon`; it is the only filled glyph and is reserved for AI.
- No logo has been designed yet: set the wordmark as _JobPilot_ in Geist 600 with `foreground`.

## Using it in the codebase

The token names match shadcn/ui (`background`, `primary`, `muted-foreground`, `ring`…). Each colour is defined once in `src/app/globals.css` as `light-dark(<light>, <dark>)` on `:root` (see _Theme mechanism_) and mapped through `@theme inline` for Tailwind v4 (`bg-primary`, `text-muted-foreground`, `rounded-lg`). The domain tokens (`beacon`, `status-*`, `match-*`) map the same way: `text-beacon`, `bg-status-offer`.

## Color tokens

Light and dark values below are copied from `src/app/globals.css`; the browser tests in `e2e/design-system.spec.ts` assert the rendered colours.

| Token                    | Light                          | Dark                           | Usage                                                                                                                                                                                                                          |
| ------------------------ | ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `background`             | `#faf5ef`                      | `#191a1e`                      | Page background behind every screen (Warm Ivory / Night Ink).                                                                                                                                                                  |
| `foreground`             | `#292a30`                      | `#f4ede5`                      | Primary text and icons on `background`, `card`, `popover`, `secondary`, `muted` and `accent` (Charcoal / Ivory Text).                                                                                                          |
| `card`                   | `#fffcf8`                      | `#25252a`                      | Raised surfaces: job cards, panels, form containers (a warm white; Graphite in dark).                                                                                                                                          |
| `card-foreground`        | `#292a30` → `foreground`       | `#f4ede5` → `foreground`       | Text on `card`.                                                                                                                                                                                                                |
| `popover`                | `#fffcf8`                      | `#2b2b31`                      | Menus, dropdowns, tooltips, dialogs.                                                                                                                                                                                           |
| `popover-foreground`     | `#292a30` → `foreground`       | `#f4ede5` → `foreground`       | Text on `popover`.                                                                                                                                                                                                             |
| `primary`                | `#b65d45`                      | `#d47a60`                      | Muted Copper / Copper Glow. The brand fill: primary buttons, the focus ring, checkbox accent, active filter chip. One primary action per view. **Not for text** — light copper is 4.2:1 on `background`; use `primary-strong`. |
| `primary-foreground`     | `#ffffff`                      | `#191a1e`                      | Text and icons on `primary` fills (white on light copper is 4.5:1, so keep labels at `label` weight or larger).                                                                                                                |
| `primary-strong`         | `#9a4a34`                      | `#e08c74`                      | Darker/lighter copper that holds 4.5:1 as text: links (`linkClass`), and the hover fill of primary buttons.                                                                                                                    |
| `secondary`              | `#e8d8c7`                      | `#303037`                      | Linen. Secondary button fills, filter chips, neutral badges.                                                                                                                                                                   |
| `secondary-foreground`   | `#292a30` → `foreground`       | `#f4ede5` → `foreground`       | Text on `secondary`.                                                                                                                                                                                                           |
| `muted`                  | `#f2e9df`                      | `#2a2a30`                      | Quiet fills: empty states, skeletons, disabled inputs.                                                                                                                                                                         |
| `muted-foreground`       | `#5f564e`                      | `#b0a79d`                      | Secondary text (company, location, timestamps, hints) on `background`, `card`, `popover`, `muted` and `secondary`.                                                                                                             |
| `accent`                 | `#f3e6c0`                      | `#3a3220`                      | A soft Antique Gold ground: hover and selected rows, the Interviewing badge.                                                                                                                                                   |
| `accent-foreground`      | `#5a4510`                      | `#e1c477`                      | Text on `accent`.                                                                                                                                                                                                              |
| `beacon`                 | `#d6b45a`                      | `#e1c477`                      | Antique Gold / Soft Gold. Marks AI and only AI: the spark glyph, _Drafted by AI_ tags, the AI button fill.                                                                                                                     |
| `beacon-foreground`      | `#292a30`                      | `#191a1e`                      | Text on a solid `beacon` fill.                                                                                                                                                                                                 |
| `border`                 | `#e8d8c7`                      | `#3a3a42`                      | Hairlines: card edges, dividers. Decorative only, never the only boundary of a control.                                                                                                                                        |
| `input`                  | `#8a7b6e`                      | `#8e8e98`                      | Borders of text inputs, selects, checkboxes (3:1 on `card` and `background`).                                                                                                                                                  |
| `ring`                   | `#b65d45` → `primary`          | `#d47a60` → `primary`          | Focus ring: 2px solid, 2px offset, on every interactive element (3:1 on its surface).                                                                                                                                          |
| `destructive`            | `#ad1f33`                      | `#ff8a93`                      | Destructive buttons, form errors, the Rejected status text. Always with a word or icon.                                                                                                                                        |
| `destructive-foreground` | `#ffffff`                      | `#2b0709`                      | Text on `destructive` fills.                                                                                                                                                                                                   |
| `danger-soft`            | `#fbe3e4`                      | `#40171c`                      | Background of error notices and the Rejected badge.                                                                                                                                                                            |
| `success`                | `#16723a`                      | `#5fcf86`                      | Positive confirmations and the Offered status. Always with a word or icon.                                                                                                                                                     |
| `success-soft`           | `#e1f3e7`                      | `#14301f`                      | Background of success notices and the Offered badge.                                                                                                                                                                           |
| `warning`                | `#8a5a00`                      | `#e8b84a`                      | Deadlines within 3 days, mid match scores, incomplete profile fields.                                                                                                                                                          |
| `warning-soft`           | `#fbf0d4`                      | `#2f2610`                      | Background of warning notices.                                                                                                                                                                                                 |
| `info`                   | `#1d5fb8`                      | `#7ab0f5`                      | Neutral information and the Applied status.                                                                                                                                                                                    |
| `info-soft`              | `#e3edfb`                      | `#15253c`                      | Background of info notices and the Applied badge.                                                                                                                                                                              |
| `status-saved`           | `#5f564e` → `muted-foreground` | `#b0a79d` → `muted-foreground` | Pipeline: Saved (reserved; no screen consumes it yet).                                                                                                                                                                         |
| `status-applied`         | `#1d5fb8` → `info`             | `#7ab0f5` → `info`             | Pipeline: Applied (reserved).                                                                                                                                                                                                  |
| `status-interview`       | `#9a4a34` → `primary-strong`   | `#e08c74` → `primary-strong`   | Pipeline: Interview (reserved).                                                                                                                                                                                                |
| `status-offer`           | `#16723a` → `success`          | `#5fcf86` → `success`          | Pipeline: Offer (reserved).                                                                                                                                                                                                    |
| `status-rejected`        | `#ad1f33` → `destructive`      | `#ff8a93` → `destructive`      | Pipeline: Rejected (reserved).                                                                                                                                                                                                 |
| `match-high`             | `#9a4a34` → `primary-strong`   | `#e08c74` → `primary-strong`   | Match score 75–100 (reserved for `MatchScore`).                                                                                                                                                                                |
| `match-mid`              | `#8a5a00` → `warning`          | `#e8b84a` → `warning`          | Match score 50–74 (reserved).                                                                                                                                                                                                  |
| `match-low`              | `#5f564e` → `muted-foreground` | `#b0a79d` → `muted-foreground` | Match score 0–49. Grey, not red: a weak match is not an error (reserved).                                                                                                                                                      |

### Verified contrast

Computed from the values above (WCAG 2.x relative luminance). The same pairs are measured on rendered pages in both themes by `e2e/design-system.spec.ts`.

| Pair                                      | Light   | Dark    | Needs |
| ----------------------------------------- | ------- | ------- | ----- |
| `foreground` on `background`              | 13.19:1 | 14.98:1 | 4.5:1 |
| `foreground` on `card`                    | 13.98:1 | 13.14:1 | 4.5:1 |
| `foreground` on `accent`                  | 11.50:1 | 10.92:1 | 4.5:1 |
| `foreground` on `secondary`               | 10.27:1 | 11.28:1 | 4.5:1 |
| `muted-foreground` on `background`        | 6.62:1  | 7.34:1  | 4.5:1 |
| `muted-foreground` on `card`              | 7.01:1  | 6.44:1  | 4.5:1 |
| `muted-foreground` on `secondary`         | 5.15:1  | 5.53:1  | 4.5:1 |
| `primary-foreground` on `primary`         | 4.53:1  | 5.59:1  | 4.5:1 |
| `primary-foreground` on `primary-strong`  | 6.17:1  | 6.77:1  | 4.5:1 |
| `primary-strong` on `background`          | 5.69:1  | 6.77:1  | 4.5:1 |
| `primary-strong` on `card`                | 6.03:1  | 5.94:1  | 4.5:1 |
| `accent-foreground` on `accent`           | 7.36:1  | 7.46:1  | 4.5:1 |
| `beacon-foreground` on `beacon`           | 7.18:1  | 10.24:1 | 4.5:1 |
| `destructive-foreground` on `destructive` | 6.95:1  | 8.19:1  | 4.5:1 |
| `destructive` on `background`             | 6.41:1  | 7.71:1  | 4.5:1 |
| `destructive` on `danger-soft`            | 5.70:1  | 6.86:1  | 4.5:1 |
| `success` on `success-soft`               | 5.19:1  | 7.31:1  | 4.5:1 |
| `warning` on `warning-soft`               | 5.23:1  | 8.10:1  | 4.5:1 |
| `info` on `info-soft`                     | 5.26:1  | 6.87:1  | 4.5:1 |
| `input` on `card`                         | 4.00:1  | 4.70:1  | 3:1   |
| `input` on `background`                   | 3.77:1  | 5.36:1  | 3:1   |
| `ring` on `background`                    | 4.17:1  | 5.59:1  | 3:1   |
| `ring` on `card`                          | 4.42:1  | 4.90:1  | 3:1   |

Muted Copper (`primary`) against `background` is 4.17:1 in light, which is why it is a fill and ring colour only.

## Typography

| Family | Stack                                                             |
| ------ | ----------------------------------------------------------------- |
| `sans` | `"Geist", "Geist Fallback", ui-sans-serif, system-ui, sans-serif` |
| `mono` | `"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace`    |

| Style     | Family | Size / line | Weight | Tracking | Usage                                                                  |
| --------- | ------ | ----------- | ------ | -------- | ---------------------------------------------------------------------- |
| `display` | sans   | 36px / 40px | 600    | -0.02em  | Dashboard greeting and empty-state headlines. Once per screen at most. |
| `h1`      | sans   | 28px / 34px | 600    | -0.015em | Page titles.                                                           |
| `h2`      | sans   | 22px / 28px | 600    | -0.01em  | Section titles and the job title on a job detail page.                 |
| `h3`      | sans   | 17px / 24px | 600    | 0        | Card titles, panel headings, job titles in lists.                      |
| `body`    | sans   | 15px / 24px | 400    | 0        | Default reading text: job descriptions, generated drafts, paragraphs.  |
| `body-sm` | sans   | 13px / 20px | 400    | 0        | Dense UI: table cells, card metadata, helper text.                     |
| `label`   | sans   | 13px / 16px | 500    | 0        | Form labels, buttons, tabs, badges.                                    |
| `caption` | sans   | 12px / 16px | 400    | 0        | Timestamps, footnotes, chart axes.                                     |
| `score`   | mono   | 20px / 24px | 600    | 0        | The number inside a match score; KPI figures on the dashboard.         |
| `mono`    | mono   | 13px / 20px | 400    | 0        | Salaries, dates in tables, IDs, keyboard shortcuts.                    |
| `eyebrow` | mono   | 11px / 16px | 500    | 0.08em   | Uppercase kicker above a section. Set in capitals in the markup.       |

## Spacing

| Token      | Value  | Usage                                                   |
| ---------- | ------ | ------------------------------------------------------- |
| `space-1`  | `4px`  | Icon-to-text gap, badge vertical padding.               |
| `space-2`  | `8px`  | Gap inside controls, between badges, tight stacks.      |
| `space-3`  | `12px` | Button horizontal padding (sm), list row padding.       |
| `space-4`  | `16px` | Button horizontal padding, form field gap.              |
| `space-6`  | `24px` | Card and panel padding, gap between cards, section gap. |
| `space-8`  | `32px` | Page gutter on desktop; gap between page sections.      |
| `space-12` | `48px` | Top of page to title; empty-state padding.              |

## Radius

| Token         | Value    | Usage                                                    |
| ------------- | -------- | -------------------------------------------------------- |
| `radius-sm`   | `6px`    | Badges, checkboxes, small buttons, inputs inside tables. |
| `radius-md`   | `8px`    | Buttons, inputs, menus, tooltips.                        |
| `radius-lg`   | `12px`   | Cards, panels, dialogs (shadcn `--radius`).              |
| `radius-full` | `9999px` | Status dots, avatars, pill toggles.                      |

## Shadows

| Token       | Value                                                                                                                                    | Usage                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `shadow-sm` | light `0 1px 2px rgb(41 42 48 / 0.08)` · dark `0 1px 2px rgb(0 0 0 / 0.4)`                                                               | Cards at rest. Most surfaces rely on `border` instead. |
| `shadow-md` | light `0 8px 24px rgb(41 42 48 / 0.12), 0 2px 6px rgb(41 42 48 / 0.08)` · dark `0 8px 24px rgb(0 0 0 / 0.5), 0 2px 6px rgb(0 0 0 / 0.4)` | Popovers, menus, dialogs, a dragged pipeline card.     |

## Motion

Colour transitions are 150ms (Tailwind's default `transition-colors`); panels may use 200ms. There are no custom duration tokens. `prefers-reduced-motion: reduce` collapses every animation and transition globally (tested). Focus rings are a fixed colour, so they do not animate in.

## Components

### Button

Buttons trigger actions; one `primary` per view, everything else `secondary` or `ghost`.

- **primary** — the main action of a screen or dialog: _Apply_, _Save profile_, _Use this_. Hover darkens to `primary-strong`.
- **secondary** — alternatives beside the primary: _Edit_, _Export_.
- **ghost** — low-emphasis actions in toolbars and card footers: _Discard_, _Skip_.
- **destructive** — irreversible removal only, always behind a confirm dialog: _Delete application_.
- **ai** — starts an AI generation: _Generate cover letter_, _Tailor CV_. Adds the spark; never use it for non-AI actions.

Labels are verbs in sentence case, two or three words. Use `size="sm"` inside cards, tables and panels. Consumer provides `children` and `onClick`; pass `type="submit"` in forms.

### Input

Text inputs collect profile data, search terms and filters; always give them a visible `label`.

Consumer provides `label`, `value`/`onChange` (or `defaultValue`), and optionally `hint` or `error`. `error` replaces the hint, turns the border `destructive` and sets `aria-invalid`. Write errors as a fix, not a complaint: _Enter a URL starting with https://_. Placeholders show an example (_e.g. Frontend Developer_), never the label.

### Badge

Badges label a job's pipeline status, AI-made content, and skills tags.

- Implemented tones: `neutral`, `accent`, `success`, `warning`, `info`, `danger`, `tag`. Job statuses use `JobStatusBadge` (job-intake feature): Saved `neutral`, Applied `info`, Interviewing `accent`, Offered `success`, Rejected `danger`, Withdrawn `tag`. Colour never carries status alone: the badge always prints the word. (The dot-and-word status tones described for the pipeline view are not built.)
- `ai` marks anything generated (_Drafted by AI_, _AI summary_) with the spark in `beacon`.
- `warning` for time pressure: _Closes in 2 days_.
- `tag` is the outlined chip for skills and keywords; use at most five per card.

### MatchScore

MatchScore shows how well a job fits the candidate profile, 0–100, as a ring and a number.

Bands are fixed: 75–100 `match-high`, 50–74 `match-mid`, 0–49 `match-low` (grey: a weak match is information, not an error). Consumer provides `score` and a `size` (`sm` in tables, `md` on cards, `lg` on the job detail header). Always pair the `lg` score with a breakdown of why (skills matched, missing requirements) — never show a score the user can't question.

### JobCard

JobCard is the unit of every job list: title, company, place, salary, match score, status and deadline.

Consumer provides the job fields and an `href` to the job detail page (the title becomes the link). Show `score` once the profile is complete; show `status` once the job is in the pipeline. Set `dueSoon` when the deadline is within three days so the date turns `warning`. Stack cards with `space-6` between them; in a pipeline column use `space-3`. Do not put buttons inside the card — actions live on the detail page or in a row menu.

### AISuggestion

AISuggestion holds anything the AI drafted — a cover letter paragraph, a tailored CV bullet, interview answers — until the user accepts it.

Every AI output passes through this panel: nothing generated is saved or sent without a human choosing _Use this_ or _Edit_. Consumer provides the draft as `children`, a `title`, the `source` (model and where it ran, e.g. _qwen2.5 · local_), and the `onAccept`, `onEdit`, `onDiscard` handlers (`onRegenerate` optional). Keep the `accent` ground with the `beacon` marker: it is how users recognise generated text across the app.

### Props

```ts
import type * as React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary: the one main action. ai: starts an AI generation (adds the spark). */
  variant?: "primary" | "secondary" | "ghost" | "destructive" | "ai";
  size?: "sm" | "md";
  children: React.ReactNode;
}
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  /** Shown instead of hint; sets aria-invalid. */
  error?: string;
}
export interface BadgeProps {
  /** Pipeline statuses render their own label and dot when children is omitted. */
  tone?:
    "neutral" | "saved" | "applied" | "interview" | "offer" | "rejected" | "warning" | "ai" | "tag";
  dot?: boolean;
  children?: React.ReactNode;
}
export interface MatchScoreProps {
  /** 0–100. 75+ high (copper), 50–74 mid (amber), below 50 low (grey). */
  score: number;
  size?: "sm" | "md" | "lg";
}
export interface JobCardProps {
  title: string;
  company: string;
  location?: string;
  workMode?: "On-site" | "Hybrid" | "Remote";
  salary?: string;
  href?: string;
  score?: number;
  status?: "saved" | "applied" | "interview" | "offer" | "rejected";
  tags?: string[];
  /** e.g. "Closes in 2 days" */
  due?: string;
  dueSoon?: boolean;
}
export interface AISuggestionProps {
  title?: string;
  kicker?: string;
  /** Model and where it ran, e.g. "qwen2.5 · local" */
  source?: string;
  acceptLabel?: string;
  onAccept?: () => void;
  onEdit?: () => void;
  onRegenerate?: () => void;
  onDiscard?: () => void;
  children: React.ReactNode;
}
export declare function Button(props: ButtonProps): React.JSX.Element;
export declare function Input(props: InputProps): React.JSX.Element;
export declare function Badge(props: BadgeProps): React.JSX.Element;
export declare function MatchScore(props: MatchScoreProps): React.JSX.Element;
export declare function JobCard(props: JobCardProps): React.JSX.Element;
export declare function AISuggestion(props: AISuggestionProps): React.JSX.Element;
```

## Implementation status

Implemented in the repo: all colour tokens, the type scale (`display`, `h1`–`h3`, `body`, `body-sm`, `label`, `caption`, `eyebrow`), radius and shadow tokens, and the primitives listed under _Component library_. Also built: the signed-in app shell and navigation (_Navigation_). Not yet built (documented above as design intent): Dashboard, Settings and the career-tool pages (so no nav entries); an account menu beyond name, email and sign out; the `score` and `mono` type styles and the mono family on `eyebrow`; `MatchScore`, `JobCard`, `AISuggestion`; the dot-and-word pipeline status badge; a `Dialog` (no screen needs one: the delete confirmation is inline; build it on the native `<dialog>` element when a screen does). Tokens with no consumer yet: `beacon`, `beacon-foreground`, `popover`, `status-*`, `match-*`.

## Theme mechanism

`src/app/globals.css` defines every colour as `--token: light-dark(<light>, <dark>)` on `:root` — one declaration per token, no duplicated dark block — and maps them through `@theme inline` so Tailwind generates `bg-card`, `text-muted-foreground`, `border-input`, `rounded-lg`, `shadow-sm`, and the type utilities `text-display`, `text-h1`, `text-h2`, `text-h3`, `text-body`, `text-body-sm`, `text-label`, `text-caption`, `text-eyebrow`.

- `:root { color-scheme: light dark }` follows the OS. `<html data-theme="light">` or `data-theme="dark"` sets `color-scheme` to one side and wins over the OS in both directions; the theme picker in the top bar sets it. `color-scheme` also themes native controls (select popups, scrollbars).
- **Browser support.** Native `light-dark()` needs Chrome 123, Firefox 120 or Safari 17.5, newer than the Next.js baseline (Chrome/Edge/Firefox 111+, Safari 16.4+). The build does not rely on it: Next's CSS compiler lowers every `light-dark()` to the `--lightningcss-light` / `--lightningcss-dark` toggle technique (`var(--lightningcss-light, <light>) var(--lightningcss-dark, <dark>)`), including for `data-theme`, which needs no modern-browser feature. Tested: the production build in current Chromium, Firefox and WebKit (`E2E_ALL_BROWSERS=1`). Not tested: the minimum versions themselves (Chrome 111, Safari 16.4, Firefox 111). `e2e/design-system.spec.ts` fails if the compiled CSS ever ships a native `light-dark()`, so the baseline is only raised on purpose.
- Tokens flip per theme, so components never use `dark:` variants. To change a colour, edit its single `light-dark()` pair and the table above together.
- Focus is a global `:focus-visible` rule: 2px solid `ring`, 2px offset, with `outline-color` fixed on every element so the ring never animates in from the text colour. Do not remove outlines on controls.
- `prefers-reduced-motion` shortens animations and transitions globally. The theme can also be chosen in the app (_Navigation_).
- `--shadow-sm` / `--shadow-md` resolve to theme-specific `--elevation-*` values (a `light-dark()` colour inside each shadow).

## Navigation

One shell, one definition of the links.

- **Structure.** `src/app/(app)/layout.tsx` renders `AppShell` (`src/components/navigation/`) around every signed-in page: skip link, sidebar (`md` and up), top bar, then the page. The `(auth)` group (sign-in, sign-up) and the 404 page are outside it. The shell is presentation only: each page and Server Action still calls `requireUser()`, and `src/proxy.ts` remains an optimistic redirect.
- **Single source.** `NAV_GROUPS` in `nav-items.ts` lists the groups and links: Workspace (Home, My jobs) and Personal (My profile). Add an item only when its page exists: no placeholder or "coming soon" links, and no empty groups. Career tools (analysis, CV and cover letters, interview preparation) and Settings will appear when those pages ship. The sidebar and the phone drawer render the same `NavList`.
- **Active route.** `getNavState(pathname, item)` returns `page` (exact match), `section` (nested under a `match: "section"` item, matched on a segment boundary so `/jobsx` is not `/jobs`) or none. An exact match sets `aria-current="page"`, a parent section `aria-current="true"`; both are styled `accent` / `accent-foreground`, medium weight. Inactive items are `muted-foreground`, and hover is `muted` with `foreground` text. Home matches only `/`.
- **Header.** The top bar holds the theme picker (and on phones the menu button and brand). Page context lives in the page: `PageHeader` takes `breadcrumbs` (`Breadcrumbs`, a `nav aria-label="Breadcrumb"`; the last item is the current page, `aria-current="page"`, not a link). Detail and edit pages show `My jobs / <title> / Edit`; top-level pages show none.
- **Phones (< 768px).** The sidebar is hidden and a menu button opens the links in a native modal `<dialog>` labelled "Menu". The browser supplies the focus trap, Escape, the inert page behind it and focus return to the button; the drawer also closes on a link click, on route change, on the close button and on the backdrop. It has no animation, so there is nothing to reduce for `prefers-reduced-motion`. Focus can leave the dialog only for the browser's own UI.
- **Account.** The sidebar footer and the drawer show the signed-in name and email and a Sign out button (one session lookup per request, shared by both). Signing out returns to `/sign-in`.
- **Theme picker.** A native select in the top bar: System, Light or Dark. Light and dark set `<html data-theme>` and are remembered in `localStorage` (`jobpilot-theme`); System removes the attribute so the OS decides. An inline script in the root `<head>` applies a saved choice before first paint. If storage is unavailable the choice still applies until reload.
- **Skip link.** The first Tab stop on every signed-in page is "Skip to main content", which moves focus to `<main id="main-content">` (every `PageShell` renders it).
- **Icons.** Inline, decorative SVGs (`aria-hidden`) next to a text label. Add new ones to `nav-icons.tsx`; no icon dependency.

## Component library

Primitives live in `src/components/ui/` (generic, no feature knowledge); layout patterns in `src/components/layout/`; the auth frame in `src/components/auth/auth-shell.tsx`. All accept standard element props (including `className` and `ref`) and are server-component safe.

| Component                                                                            | Variants / props                                                                                          | Use for                                                                                                      |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `Button`                                                                             | `variant`: `primary` (default), `secondary`, `ghost`, `destructive`; `size`: `sm`, `md`; `loading`        | Actions. Defaults to `type="button"`; pass `type="submit"` in forms. `loading` disables and shows a spinner. |
| `Input`, `Textarea`                                                                  | native props; `aria-invalid` turns the border `destructive`                                               | Text entry. Always pair with a label via `FormField`.                                                        |
| `Select`                                                                             | native select props; `aria-invalid` turns the border `destructive`                                        | Choosing one of a short list. Native element; pair with a label via `FormField`.                             |
| `Label`                                                                              | native label props                                                                                        | Standalone labels.                                                                                           |
| `Checkbox`                                                                           | `label` (required)                                                                                        | Single boolean choices inside a `FieldGroup`.                                                                |
| `FormField`                                                                          | `id`, `label`, `hint`, `error`; children is a function receiving `{ id, aria-describedby, aria-invalid }` | Label + control + hint + error, correctly wired.                                                             |
| `FieldGroup`                                                                         | `id`, `legend`, `error`                                                                                   | Fieldset for related checkboxes/radios.                                                                      |
| `Card` (+ `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`) |                                                                                                           | Raised surface on `card` with `border` and `shadow-sm`.                                                      |
| `Badge`                                                                              | `tone`: `neutral`, `accent`, `success`, `warning`, `info`, `danger`, `tag`                                | Short labels. Colour never carries meaning alone: keep a word.                                               |
| `Separator`                                                                          | `orientation`, `decorative`                                                                               | Dividers (hairline `border`).                                                                                |
| `Skeleton`, `Spinner`                                                                | `Spinner` has `label` (empty string when a nearby label exists)                                           | Loading placeholders.                                                                                        |
| `Alert` (+ `AlertTitle`, `AlertDescription`)                                         | `variant`: `info`, `success`, `warning`, `destructive`                                                    | Feedback with a distinct icon shape per variant. `destructive` uses `role="alert"`, others `role="status"`.  |
| `linkClass`                                                                          | string constant in `ui/link.tsx`                                                                          | Inline text links: `primary-strong`, medium weight, underlined. Never hand-write link classes.               |
| `PageShell`                                                                          | `width`: `narrow`, `form` (default), `wide`; `centered`                                                   | Page container with gutters and max width. Renders the `<main>`.                                             |
| `PageHeader`                                                                         | `title`, `description`, `actions`, `breadcrumbs`                                                          | The page `h1`, with an optional breadcrumb trail above it.                                                   |
| `Breadcrumbs`                                                                        | `items`: `{ label, href? }`; the last item is the current page                                            | Path back up to a section on nested pages.                                                                   |
| `AppShell`, `NavList`, `MobileNav`, `ThemeSelect`, `AccountPanel`                    | in `src/components/navigation/`                                                                           | The signed-in frame; see _Navigation_. Links come from `NAV_GROUPS`.                                         |
| `FormSection`                                                                        | `title`, `description`                                                                                    | Titled group of fields.                                                                                      |
| `EmptyState`                                                                         | `title`, `description`, `action`                                                                          | Nothing-here-yet panels.                                                                                     |
| `LoadingState`                                                                       | `label`                                                                                                   | Suspense fallback for a section.                                                                             |
| `AuthShell`                                                                          | `title`, `footer`                                                                                         | Sign-in and sign-up frame.                                                                                   |

```tsx
<FormField id="email" label="Email" error={errors.email}>
  {(control) => <Input {...control} name="email" type="email" />}
</FormField>
<Button type="submit" loading={pending}>Save profile</Button>
```

## Rules for feature screens

- Use semantic tokens only: `bg-card`, `text-muted-foreground`, `border-input`, `text-destructive`. No palette colours (`zinc-*`, `red-*`), no hex/rgb values, no `dark:` variants, no arbitrary values for colour, radius or type size. If no token fits, add one here and in `globals.css` first.
- Do not recreate a primitive. If a screen needs a button, input, card, alert or field wrapper, use the existing one. Duplicated class strings for controls are a review failure.
- Feature modules compose primitives; they do not add domain behaviour to `src/components/ui/`. Domain components (e.g. `JobCard`) belong to their feature module and are built from primitives.
- Signed-in pages live under `src/app/(app)/` and use `PageShell` + `PageHeader` (with `breadcrumbs` when nested); loading fallbacks use `LoadingState` or `Skeleton`. Never add navigation markup to a page: add the item to `NAV_GROUPS`.
- Inline links use `linkClass`; text in the brand colour uses `primary-strong`, never `primary`.
- Typography uses the `text-*` scale above. One `h1` per page, supplied by `PageHeader` or `AuthShell`.

## Adding a new component

1. Check the table above and `src/components/ui/` first; extend a variant rather than adding a near-duplicate.
2. Place it in `ui/` (generic) or `layout/` (page structure), one file per component, named in kebab-case.
3. Type props by extending `React.ComponentProps<"element">`, spread the rest onto the element, and accept `className`. Variants are a `const` map keyed by name; use `cn()` from `ui/cn.ts`.
4. Use only semantic tokens and the global focus ring. Keep both themes correct without `dark:`.
5. Document it in the table above with variants and usage.
6. Add a new token only when no existing one carries the meaning; verify its contrast in both themes.

## Accessibility requirements

- Every control has a visible label (`FormField`/`Label`); placeholders are examples, never labels.
- Errors and hints are linked with `aria-describedby`, and invalid controls set `aria-invalid`.
- Interactive elements show the global focus ring (2px `ring`, 2px offset) in both themes, never removed.
- Text meets 4.5:1 and control borders/focus ring 3:1, using only the token pairings in _Color tokens_.
- Status is never colour alone: pair with a word or icon.
- Everything works by keyboard with native elements first (`button`, `input`, `select`, `fieldset`); add ARIA only to fill gaps. `Select` is the browser's native control: type-ahead, Tab and Enter work in every engine tested; arrow-key behaviour on a closed select is the browser's own and differs by OS (macOS opens a popup). Long unbroken text wraps (`wrap-anywhere`) in headers, cards and detail pages; it is never truncated.
- Loading and dynamic feedback is announced (`Spinner` label, `Alert` roles, `aria-live` regions); busy buttons set `aria-busy`.
- Motion respects `prefers-reduced-motion`.
