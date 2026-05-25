# Plan: Login Fix, Title Case, Bundle 3

## 1. Fix the login redirect loop

**Symptom:** Submit credentials → brief load → splash flashes → bounced back to `/login`.

**Root cause:** `_authenticated.beforeLoad` awaits `supabase.auth.getUser()` (network call to `/auth/v1/user`) the instant `navigate({ to: "/chat" })` fires. On a cold worker / slow link, that call returns no user before the new session token is fully attached, so the guard throws `redirect({ to: "/login" })`. The `Splash` component then re-mounts because `sessionStorage` was cleared by the failed nav, producing the flash.

**Fix:**
- Replace the network `getUser()` check in `_authenticated.beforeLoad` with the synchronous `getSession()` — it reads from `localStorage` and is the canonical "is there a token?" check. Only treat absence of a session as unauthenticated; never redirect on a transient network error.
- In `login.tsx`, after `signInWithPassword` resolves, do not navigate manually. Instead `await supabase.auth.getSession()` to confirm the session is persisted, then `router.invalidate()` + `navigate({ to: "/chat", replace: true })`. The `replace` kills the back-button bounce, and invalidate makes the guard re-evaluate with the fresh session.
- Mirror the same change in `index.tsx` (root redirect) — use `getSession()`, not `getUser()`.
- Harden `Splash`: gate on `sessionStorage` *and* skip rendering when the current path is `/login` (so a bounce never re-triggers the animation).

## 2. Title Case for all headings

Audit every `<h1>`/`<h2>`/`<h3>` and equivalent display text (page titles, card titles, module section headers, dialog titles, the splash tagline). Convert from current lowercase styling to Title Case at the source string level (not via CSS `text-transform`, so it reads correctly to screen readers and in og:title).

Scope: all files under `src/routes/_authenticated/*`, `src/routes/login.tsx`, `src/routes/__root.tsx` (404 / error pages), `src/components/Splash.tsx`, `ModuleShell.tsx`. Keep brand mark `kora` lowercase (it's a logotype).

## 3. Bundle 3 — Agentic powers + Settings + module verification

### 3a. Settings module (new)
- New route `src/routes/_authenticated/settings.tsx` with tabs:
  - **Profile** — display name, avatar (stored in new `profiles` table linked to `auth.users`).
  - **Preferences** — chat default mode, splash on/off, theme density.
  - **Account** — change password, sign out everywhere.
- Add `Settings` tab to the top nav in `_authenticated.tsx`.
- Migration: `profiles` table (`user_id` FK, `display_name`, `avatar_url`, `preferences jsonb`) with RLS (own row only) + trigger to auto-insert on signup.

### 3b. Agentic powers (using Lovable AI for sub-agents)
- **Sub-agent orchestration:** extend `src/agent/reasoner.server.ts` so a plan node can spawn a child reasoner call with its own scratch context, returning a structured result to the parent. All calls go through `chat()` in `llm.server.ts` (single `LOVABLE_API_KEY`).
- **Browser/URL skill:** new skill `open_url` that returns a structured action the chat UI renders as a button (`Open <site>`) — opens in a new tab on click. Purely client-side execution; agent emits the intent.
- **Email skill:** new skill `send_email` that calls a TanStack server fn → Lovable AI Gateway is not an email provider, so wire it via a `resend` API call. Requires `RESEND_API_KEY` secret — I'll request it via `add_secret` when implementing.
- **Proactive nudges:** the existing `/api/public/cron/chronos.ts` route already exists; wire it to scan `chronos_rules`, run matching ones through the reasoner, and write results into `signals` so they surface in `/inbox`.

### 3c. Module sweep — make every existing module actually work
Walk each authed route and verify the create/read/update/delete paths work end-to-end against the live DB. Known-broken or stubbed areas to repair:
- `/plans` + `/plans/$id` — wire to `execution_plans` + `task_runs` (live data, not placeholder).
- `/memory` — list/search `memory_chunks`, allow manual add + delete.
- `/skills` — list `skills`, view active version code, toggle enabled.
- `/vault` — list/add/delete `vault_secrets` (values write-only, never read back).
- `/rules` — CRUD on `chronos_rules`.
- `/inbox` — list `signals`, mark handled.
- `/now` — read `user_state`, edit focus.
- `/logs` — tail `task_runs` (latest 100).
- `/chat` — confirm threads + streaming + uploads still work after the auth fix.

For each, add a friendly empty state and a "something went wrong" boundary via the existing `ModuleShell`.

### 3d. Auth-ready hook for safe queries
Add `src/hooks/useAuthReady.ts` (per the established pattern): `getSession()` first, then subscribe to `onAuthStateChange`. Authed modules use `enabled: isReady && !!user` on their queries so RLS-protected calls never fire before the bearer token is attached. This is what prevents the "blank module + 401" class of bug across the app.

## Technical notes
- No new tables besides `profiles`. All other modules already have schema.
- One new secret request: `RESEND_API_KEY` (for the email skill). I'll prompt before writing the email code.
- No edge functions; everything stays in TanStack server fns / server routes.
- Title Case is a source-string change; no CSS tricks.

## Out of scope
- Push notifications, real file-upload pipeline beyond chat attachments, parent-child agents beyond a single nested level — those stay parked from earlier prioritization.
