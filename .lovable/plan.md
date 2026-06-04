## 1. Fix the login redirect bug (root cause)

The `/_authenticated` guard runs during **SSR** for `/chat`. On the server there is no `localStorage`, so `supabase.auth.getSession()` returns `{ session: null }` and the guard redirects to `/login` — every time, even right after a successful sign-in. That is the "loads for a second, splash flashes, bounced back to login" symptom.

Fix:
- Replace `src/routes/_authenticated.tsx` with the integration-managed pattern at `src/routes/_authenticated/route.tsx`:
  - `ssr: false` on the layout (Supabase session only exists in the browser).
  - `beforeLoad` calls `supabase.auth.getUser()` (re-validates with the auth server, not a stale cookie/localStorage read) and `throw redirect({ to: "/login" })` on failure.
  - Component renders the same header/nav + `<Outlet />`.
- Move every child route file from `src/routes/_authenticated/*.tsx` into the same folder — they already live there, so no path changes.
- Simplify `login.tsx`: drop the `getSession()` polling loop and `router.invalidate()` dance. After `signInWithPassword` succeeds, call `router.invalidate()` once and `navigate({ to: "/chat", replace: true })`. The root-level `onAuthStateChange` subscriber already invalidates queries.
- Keep `src/routes/index.tsx` using `getSession()` (acceptable for the post-login bounce because the `_authenticated` gate will re-validate with `getUser()`).
- Splash: keep current `sessionStorage` + `/login` skip; no change needed once the loop stops.

## 2. Verify Chat + Agent + Memory work

Smoke-check after the fix:
- **Chat (streaming)**: send a message in `chat` mode → `/api/public/chat/stream` returns SSE deltas → assistant message persists. Confirm the bearer token attach still works after the new layout.
- **Agent (thinking mode)**: send a goal in `think` mode → `reasonAndStartExecution` creates an `execution_plans` row → `executePlan` runs → `task_runs` populate → UI polls via `getPlan` and renders the trace.
- **Memory**: name extraction inserts into `memory_chunks`; `match_memory_chunks` RPC returns snippets for the next chat. Manual add via `addMemory` works from `/memory`.
- **Settings, Plans, Skills, Vault, Rules, Now, Logs, Inbox**: load each route signed in; confirm queries return data and empty states render.

Any failure found gets a surgical fix in the same pass (no rewrites).

## 3. Refactor agent runtime to the Claude-Code / Hermes architecture

Implemented entirely with **Lovable AI** (`google/gemini-2.5-pro` for reasoning, `google/gemini-3-flash-preview` for chat/extraction, `google/gemini-embedding-001` for memory).

### 3a. Single-threaded master loop (`nO`)
New `src/agent/master-loop.server.ts`:
- Implements **Gather Context → Take Action → Verify → Loop** with a flat message history capped at N turns.
- Tool registry exposed to the LLM via function calls: `read_file`, `write_memory`, `run_python` (E2B), `spawn_subagent`, `search_memory`, `read_vault`, `update_state`.
- Persists the running TODO plan to `execution_plans.dag.todo` so it survives worker restarts (state materialization).
- Replaces the current "reasoner → executor" two-shot flow as the default for `thinking` mode; the existing `makePlan` + `executePlan` becomes the fan-out path the master loop *invokes* when it decides to delegate.

### 3b. Dynamic Workflows (parallel sub-agent fan-out + adversarial verifier)
Extend `executor.server.ts`:
- When the reasoner emits ≥3 independent nodes (no `depends_on`), execute them **in parallel** via `Promise.all` instead of the current sequential topo walk. Each sub-agent has its own isolated context (already true — they only see their stdin + dep env).
- Add a **verifier pass**: after a plan finishes, spawn one `google/gemini-2.5-pro` call with the role "adversarial verifier" that receives the goal + final outputs and tries to refute them. If it produces a counter-argument with confidence ≥ threshold, the master loop spawns a fix node and re-runs the affected branch (capped at 2 fix iterations to avoid loops). Verifier result is stored on `execution_plans.dag.verification`.
- Keep `MAX_SUBAGENT_DEPTH = 2` and the existing checkpoint pattern (each node already persists to `task_runs`, so resume-from-checkpoint is already free).

### 3c. Hermes 3-layer prompt hierarchy + skill registry
New `src/agent/prompt-stack.server.ts` builds every system prompt as:
```
[ soul.md  — persistent Kora identity & boundaries     ]
[ user.md  — profile snapshot from profiles.preferences ]
[ memory.md — top-K memory_chunks for the goal         ]
[ skills    — names+descriptions of matching skills    ]
[ live history                                          ]
```
- `soul.md` lives at `src/agent/prompts/soul.md` (static, bundled).
- `user.md` is materialized per-request from `profiles` row.
- `memory.md` uses the existing `match_memory_chunks` RPC.
- **Skill registry as procedural memory**: the existing `skills` table already stores reusable Python snippets keyed by signature hash. Add a `skills.intent_embedding` column + migration so the master loop can semantic-search past skills ("have I solved this before?") and inject the code as a one-shot example instead of regenerating from scratch — this is the agentskills.io / GEPA-style self-improvement loop.
- After a successful plan, write a one-paragraph "playbook" memory chunk (`metadata.kind = "playbook"`) summarizing the sequence — same idea as Hermes' self-reflective playbooks.

### 3d. Pluggable memory interface
Wrap memory access in `src/agent/memory.server.ts` with `searchMemory(userId, query, { providers: ["local"] })`. Local provider = current `memory_chunks` + pgvector. Interface leaves room to add `hindsight` / `mem0` later without touching call sites.

## Technical Details

- **Files created**: `src/routes/_authenticated/route.tsx`, `src/agent/master-loop.server.ts`, `src/agent/prompt-stack.server.ts`, `src/agent/prompts/soul.md`, `src/agent/memory.server.ts`, one migration for `skills.intent_embedding vector(768)`.
- **Files modified**: `src/routes/login.tsx` (simplify post-login), `src/agent/executor.server.ts` (parallel fan-out + verifier), `src/agent/reasoner.server.ts` (emit verifier-friendly metadata), `src/lib/chat.functions.ts` (route thinking mode through master loop), `src/components/Splash.tsx` (no change expected — re-verify after layout move).
- **Files deleted**: `src/routes/_authenticated.tsx` (replaced by folder `route.tsx`).
- **No changes** to: `client.ts`, `client.server.ts`, `auth-middleware.ts`, `auth-attacher.ts`, `types.ts`, `start.ts`.
- **All AI calls** continue through `src/agent/llm.server.ts` → Lovable AI Gateway. No new providers, no new secrets.

## Order of execution
1. Login fix + verify sign-in → /chat works.
2. End-to-end smoke test of chat, agent, memory, every module.
3. Build master loop + verifier + parallel fan-out + skill semantic recall.
4. Final verification pass.
