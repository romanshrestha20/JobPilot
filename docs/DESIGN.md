# JobPilot Design System

Design reference for the JobPilot UI. Built for Next.js + Tailwind CSS v4 + shadcn/ui, with Geist and Geist Mono (already loaded in `src/app/layout.tsx`). Token names follow shadcn/ui and are implemented in `src/app/globals.css`, which is the executable source of truth (see _Implementation status_).

Principle: **the AI proposes, the user decides.** Calm neutrals, one confident green for direction (`primary`), and amber (`beacon`) only where AI has been at work.

JobPilot is a calm co-pilot for a stressful task. The interface should feel like a well-kept instrument panel: quiet neutrals, one confident green for direction, and amber that lights up only where the AI has been at work. The user is always the pilot — the AI proposes, the person decides.

## Content fundamentals

- **Voice:** direct, encouraging, never hype. Speak to the user as _you_; JobPilot refers to itself rarely and never as _I_ in the UI.
- **Casing:** sentence case everywhere — page titles, buttons, tabs, badges (_Save job_, not _Save Job_). Uppercase only for `eyebrow` kickers.
- **Numbers over adjectives:** _12 new matches_, _Closes in 2 days_, _86 match_ — not _lots of great jobs_.
- **Name the AI honestly:** label generated content _Drafted by AI_ or _AI summary_, and show which model ran it (_qwen2.5 · local_). Never present AI text as the user's own until they accept it.
- **Errors say how to fix:** _Enter a URL starting with https://_, not _Invalid input_.
- **No emoji** in product UI. Rejections are stated plainly and kindly: _Not selected_, with the next step beside it.

## Color guidelines

- Build every screen on `background`, with content on `card` and overlays on `popover`. Text is `foreground`; secondary text is `muted-foreground`.
- `primary` (Course green) is the brand and the direction: the single primary button, links, the active nav item, focus rings, and high match scores. Do not use it for decoration.
- `beacon` (amber) means **AI**, and only AI: the spark glyph, _Drafted by AI_ tags, the `ai` button, and the `beacon-soft` ground of `AISuggestion`. If something is amber and not AI, it is `warning`, which is a different, darker token.
- Status colours always travel with a word: `status-saved`, `status-applied`, `status-interview`, `status-offer`, `status-rejected` on their `*-soft` grounds via `Badge`.
- Match scores use `match-high` / `match-mid` / `match-low` bands at 75 and 50. Low is grey: a weak match is information, not failure.
- `destructive` is for errors and irreversible actions only.
- Both themes are first-class. Every text token here holds 4.5:1 on the grounds its usage note names in Light and Dark; `input` borders and the focus ring hold 3:1.

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

- App shell: a 240px left sidebar (Dashboard, Jobs, Applications, Documents, Interviews) on `card`, content on `background`, max content width 1200px.
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

The token names match shadcn/ui (`background`, `primary`, `muted-foreground`, `ring`…), so they drop into `src/app/globals.css` as CSS variables under `:root` (light) with dark overrides selected by `prefers-color-scheme` or `data-theme` (see _Theme mechanism_), mapped through `@theme inline` for Tailwind v4 (`bg-primary`, `text-muted-foreground`, `rounded-lg`). The domain tokens (`beacon`, `status-*`, `match-*`) map the same way: `text-beacon`, `bg-status-offer`.

## Color tokens

Every text pairing below meets WCAG AA (4.5:1) on the surfaces named in its usage, in both themes. Control borders and the focus ring meet 3:1.

| Token                    | Light                          | Dark                           | Usage                                                                                                                                 |
| ------------------------ | ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `background`             | `#f6f7f5`                      | `#0d1113`                      | Page background behind every screen.                                                                                                  |
| `foreground`             | `#14191c`                      | `#e7eae8`                      | Primary text and icons on `background`, `card`, `popover`, `secondary` and `muted`.                                                   |
| `card`                   | `#ffffff`                      | `#151b1e`                      | Raised surfaces: job cards, panels, table containers.                                                                                 |
| `card-foreground`        | `#14191c` → `foreground`       | `#e7eae8` → `foreground`       | Text on `card`.                                                                                                                       |
| `popover`                | `#ffffff`                      | `#1b2226`                      | Menus, dropdowns, tooltips, dialogs.                                                                                                  |
| `popover-foreground`     | `#14191c` → `foreground`       | `#e7eae8` → `foreground`       | Text on `popover`.                                                                                                                    |
| `primary`                | `#0c6a56`                      | `#46c4a0`                      | Course green. The brand: primary buttons, links, active nav, focus ring, high match scores. One primary action per view.              |
| `primary-foreground`     | `#ffffff`                      | `#04241c`                      | Text and icons on `primary` fills.                                                                                                    |
| `secondary`              | `#eaedea`                      | `#212a2e`                      | Secondary button fills and segmented controls.                                                                                        |
| `secondary-foreground`   | `#14191c` → `foreground`       | `#e7eae8` → `foreground`       | Text on `secondary`.                                                                                                                  |
| `muted`                  | `#eaedea`                      | `#1c2427`                      | Quiet fills: table header rows, skeletons, disabled inputs, empty states.                                                             |
| `muted-foreground`       | `#566066`                      | `#99a4a9`                      | Secondary text (company, location, timestamps, helper text) on `background`, `card`, `popover` and `muted`.                           |
| `accent`                 | `#dff0e9`                      | `#14322a`                      | Hover and selected rows, active nav item background.                                                                                  |
| `accent-foreground`      | `#0a4a3c`                      | `#9be6cd`                      | Text on `accent`.                                                                                                                     |
| `destructive`            | `#b3261e`                      | `#f07167`                      | Destructive buttons, form errors, the Rejected status text.                                                                           |
| `destructive-foreground` | `#ffffff`                      | `#2b0705`                      | Text on `destructive` fills.                                                                                                          |
| `border`                 | `#dbe0dc`                      | `#283135`                      | Hairlines: card edges, dividers, table rules. Decorative only, never the only boundary of a control.                                  |
| `input`                  | `#848d92`                      | `#66717a`                      | Borders of text inputs, selects, checkboxes (3:1 on `card` and `background`).                                                         |
| `ring`                   | `#0c6a56` → `primary`          | `#46c4a0` → `primary`          | Focus ring: 2px solid, 2px offset, on every interactive element.                                                                      |
| `beacon`                 | `#9a5200`                      | `#f2ad4e`                      | Beacon amber. Marks AI: AI-generated text labels, the spark glyph, 'Drafted by AI' tags. Text on `background`, `card`, `beacon-soft`. |
| `beacon-soft`            | `#fbeed6`                      | `#33250f`                      | Background of AI suggestion panels and AI tags.                                                                                       |
| `beacon-foreground`      | `#ffffff`                      | `#2a1700`                      | Text on a solid `beacon` fill (rare: the AI 'Generate' button).                                                                       |
| `success`                | `#16723a`                      | `#5fcf86`                      | Positive confirmations: saved, sent, completed steps. Always with a word or icon.                                                     |
| `success-soft`           | `#e1f3e7`                      | `#14301f`                      | Background of success notices and the Offer status.                                                                                   |
| `warning`                | `#8a5a00`                      | `#e8b84a`                      | Deadlines within 3 days, mid match scores, incomplete profile fields.                                                                 |
| `warning-soft`           | `#fbf0d4`                      | `#2f2610`                      | Background of warning notices.                                                                                                        |
| `info`                   | `#1d5fb8`                      | `#7ab0f5`                      | Neutral information and the Applied status.                                                                                           |
| `info-soft`              | `#e3edfb`                      | `#15253c`                      | Background of info notices and the Applied status.                                                                                    |
| `danger-soft`            | `#fbe5e3`                      | `#3a1513`                      | Background of error notices and the Rejected status.                                                                                  |
| `status-saved`           | `#566066` → `muted-foreground` | `#99a4a9` → `muted-foreground` | Pipeline: Saved. Text and dot.                                                                                                        |
| `status-applied`         | `#1d5fb8` → `info`             | `#7ab0f5` → `info`             | Pipeline: Applied. Text and dot on `info-soft`.                                                                                       |
| `status-interview`       | `#0c6a56` → `primary`          | `#46c4a0` → `primary`          | Pipeline: Interview. Text and dot on `accent`.                                                                                        |
| `status-offer`           | `#16723a` → `success`          | `#5fcf86` → `success`          | Pipeline: Offer. Text and dot on `success-soft`.                                                                                      |
| `status-rejected`        | `#b3261e` → `destructive`      | `#f07167` → `destructive`      | Pipeline: Rejected. Text and dot on `danger-soft`.                                                                                    |
| `match-high`             | `#0c6a56` → `primary`          | `#46c4a0` → `primary`          | Match score 75–100: ring and number.                                                                                                  |
| `match-mid`              | `#8a5a00` → `warning`          | `#e8b84a` → `warning`          | Match score 50–74: ring and number.                                                                                                   |
| `match-low`              | `#566066` → `muted-foreground` | `#99a4a9` → `muted-foreground` | Match score 0–49: ring and number. Grey, not red: a weak match is not an error.                                                       |
| `match-track`            | `#e3e7e4`                      | `#283135`                      | Unfilled part of the match ring and progress bars.                                                                                    |

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

| Token       | Value                                                                                                                                | Usage                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `shadow-sm` | light `0 1px 2px rgba(20,25,28,0.06)` · dark `0 1px 2px rgba(0,0,0,0.4)`                                                             | Cards at rest. Most surfaces rely on `border` instead. |
| `shadow-md` | light `0 8px 24px rgba(20,25,28,0.10), 0 2px 6px rgba(20,25,28,0.06)` · dark `0 8px 24px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.4)` | Popovers, menus, dialogs, a dragged pipeline card.     |

## Components

### Button

Buttons trigger actions; one `primary` per view, everything else `secondary` or `ghost`.

- **primary** — the main action of a screen or dialog: _Apply_, _Save profile_, _Use this_.
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

- Status tones `saved`, `applied`, `interview`, `offer`, `rejected` print their own word and a dot when no `children` are given. Colour never carries status alone: keep the word.
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

Every AI output passes through this panel: nothing generated is saved or sent without a human choosing _Use this_ or _Edit_. Consumer provides the draft as `children`, a `title`, the `source` (model and where it ran, e.g. _qwen2.5 · local_), and the `onAccept`, `onEdit`, `onDiscard` handlers (`onRegenerate` optional). Keep the `beacon-soft` ground: it is how users recognise generated text across the app.

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
  /** 0–100. 75+ high (green), 50–74 mid (amber), below 50 low (grey). */
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

Implemented in the repo: all colour tokens, the type scale (`display`, `h1`–`h3`, `body`, `body-sm`, `label`, `caption`, `eyebrow`), radius and shadow tokens, and the primitives listed under _Component library_. Not yet built (documented above as design intent): the `score` and `mono` type styles and the mono family on `eyebrow` (`globals.css` defines `eyebrow` size, weight and tracking only; add `--text-score` / `--text-mono` and set the family when a screen needs them), `MatchScore`, `JobCard`, `AISuggestion`, the `ai` Button variant, status/`ai` Badge tones, the app shell, Dialog, and Lucide icons. Build them under the rules below when a feature needs them. No component library (Radix, shadcn CLI, cva) is installed; primitives are plain React + Tailwind.

## Theme mechanism

`src/app/globals.css` defines every token as a CSS variable on `:root` (light) and maps them through `@theme inline` so Tailwind generates `bg-card`, `text-muted-foreground`, `border-input`, `rounded-lg`, `shadow-sm`, and the type utilities `text-display`, `text-h1`, `text-h2`, `text-h3`, `text-body`, `text-body-sm`, `text-label`, `text-caption`, `text-eyebrow`.

- Dark follows the OS (`prefers-color-scheme`). `<html data-theme="light">` or `data-theme="dark"` overrides it; there is no in-app toggle yet. The dark block exists twice in the stylesheet (media query and `data-theme="dark"`); change both together.
- Tokens flip per theme, so components never use `dark:` variants.
- Focus is a global `:focus-visible` rule: 2px solid `ring`, 2px offset. Do not remove outlines on controls.
- `prefers-reduced-motion` shortens animations and transitions globally.
- `--shadow-sm` / `--shadow-md` resolve to theme-specific `--elevation-*` values.

## Component library

Primitives live in `src/components/ui/` (generic, no feature knowledge); layout patterns in `src/components/layout/`; the auth frame in `src/components/auth/auth-shell.tsx`. All accept standard element props (including `className` and `ref`) and are server-component safe.

| Component                                                                            | Variants / props                                                                                          | Use for                                                                                                      |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `Button`                                                                             | `variant`: `primary` (default), `secondary`, `ghost`, `destructive`; `size`: `sm`, `md`; `loading`        | Actions. Defaults to `type="button"`; pass `type="submit"` in forms. `loading` disables and shows a spinner. |
| `Input`, `Textarea`                                                                  | native props; `aria-invalid` turns the border `destructive`                                               | Text entry. Always pair with a label via `FormField`.                                                        |
| `Label`                                                                              | native label props                                                                                        | Standalone labels.                                                                                           |
| `Checkbox`                                                                           | `label` (required)                                                                                        | Single boolean choices inside a `FieldGroup`.                                                                |
| `FormField`                                                                          | `id`, `label`, `hint`, `error`; children is a function receiving `{ id, aria-describedby, aria-invalid }` | Label + control + hint + error, correctly wired.                                                             |
| `FieldGroup`                                                                         | `id`, `legend`, `error`                                                                                   | Fieldset for related checkboxes/radios.                                                                      |
| `Card` (+ `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`) |                                                                                                           | Raised surface on `card` with `border` and `shadow-sm`.                                                      |
| `Badge`                                                                              | `tone`: `neutral`, `accent`, `success`, `warning`, `info`, `danger`, `tag`                                | Short labels. Colour never carries meaning alone: keep a word.                                               |
| `Separator`                                                                          | `orientation`, `decorative`                                                                               | Dividers (hairline `border`).                                                                                |
| `Skeleton`, `Spinner`                                                                | `Spinner` has `label` (empty string when a nearby label exists)                                           | Loading placeholders.                                                                                        |
| `Alert` (+ `AlertTitle`, `AlertDescription`)                                         | `variant`: `info`, `success`, `warning`, `destructive`                                                    | Feedback. `destructive` uses `role="alert"`, others `role="status"`.                                         |
| `PageShell`                                                                          | `width`: `narrow`, `form` (default), `wide`; `centered`                                                   | Page container with gutters and max width. Renders the `<main>`.                                             |
| `PageHeader`                                                                         | `title`, `description`, `actions`                                                                         | The page `h1`.                                                                                               |
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
- Pages use `PageShell` + `PageHeader`; loading fallbacks use `LoadingState` or `Skeleton`.
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
- Everything works by keyboard with native elements first (`button`, `input`, `fieldset`); add ARIA only to fill gaps.
- Loading and dynamic feedback is announced (`Spinner` label, `Alert` roles, `aria-live` regions); busy buttons set `aria-busy`.
- Motion respects `prefers-reduced-motion`.
