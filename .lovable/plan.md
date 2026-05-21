
# Project Kora on Lovable + E2B — Autonomous Skill Factory

Accepted. The fixed-toolset model is replaced with a real code-gen sandbox via the **E2B Sandbox SDK**. TanStack Start runs the brain on Cloudflare Workers; E2B runs the hands as ephemeral Linux micro-VMs. Self-heal loop stays intact end-to-end.

## Architecture

```text
Browser (React control panel)
        │
        ▼
TanStack Start (Workers) ── Lovable Cloud (Postgres + pgvector)
        │                          │
        │ createServerFn          tables: signals, user_state, memory_chunks,
        │                                 execution_plans, task_runs, skills,
        │                                 skill_versions, chronos_rules
        ▼
[Engine 1] Ingestion   ── POST /api/public/ingest  (HMAC)
                          POST /api/public/cron/chronos  (pg_cron, 60s)
[Engine 2] Memory      ── pgvector (gemini-embedding-001, 768d)
                          + UserState ledger row
[Engine 3] Reasoner    ── Lovable AI Gateway (gemini-3-flash-preview / gpt-5)
                          tool-calling → Zod-validated ExecutionPlan DAG
[Engine 4] Executor    ── topo-sort DAG → for each node:
                            1. lookup `skills` cache (by tool_name + signature)
                            2. if miss → Developer-State LLM writes Python/TS
                            3. spawn E2B Sandbox, mount inputs, run code
                            4. capture stdout / stderr / exit_code / artifacts
                            5. if exit_code != 0 → feed stderr back to LLM,
                               regenerate, retry (max 3)
                            6. on success → persist as skill_version,
                               promote to active skill
```

## E2B integration

- Add `@e2b/code-interpreter` (works on Workers — pure HTTP/WS client, no native deps).
- New `E2B_API_KEY` runtime secret (user will be prompted via `add_secret`).
- Server-only helper `src/agent/sandbox/e2b.server.ts` exposes:
  - `runPython(code, { files?, env?, timeoutMs })`
  - `runBash(cmd, opts)`
  - `installAndRun(pkgs, code, opts)`
- Sandbox lifecycle: one ephemeral sandbox per task-node attempt; killed at end of `createServerFn` invocation. No long-lived sandbox state on Workers.
- Outbound network from the sandbox is allowed (that is the whole point — Gmail API, web scraping, etc.). Per-skill allowlist enforced by the Reasoner prompt + recorded in `skills.network_policy`.
- Secrets for the user's third-party APIs (Gmail OAuth refresh token, etc.) are pulled from Lovable Cloud at execution time and injected into the sandbox `env` per run — never baked into stored skill code.

## Database (Lovable Cloud, RLS scoped to `auth.uid()`)

- `signals` — id, user_id, source, raw_text, priority, status, created_at
- `user_state` — user_id PK, focus, last_active, flags jsonb
- `memory_chunks` — id, user_id, text, embedding vector(768), metadata jsonb
- `execution_plans` — id, signal_id, dag jsonb, status, created_at
- `task_runs` — id, plan_id, node_id, tool_name, input jsonb, output jsonb, stdout, stderr, exit_code, status, attempt, duration_ms
- `skills` — id, user_id, name, description, signature_hash, language (python|bash|node), entrypoint, network_policy jsonb, active_version_id, success_count, fail_count
- `skill_versions` — id, skill_id, code text, requirements text, generated_by_model, parent_version_id, created_at, validated_at
- `chronos_rules` — id, user_id, cron, condition jsonb, trigger_text
- `vault_secrets` — id, user_id, name, value (encrypted) — per-user third-party creds the sandbox can request

Extensions: `vector`, `pg_cron`, `pgcrypto`.

## Server functions / routes

`src/lib/*.functions.ts` (auth-protected via `requireSupabaseAuth`):
- `ingestSignal`, `runReasoner`, `runExecutor`, `executeNode`
- `runChronos` (public route, HMAC-signed cron caller)
- `listSignals`, `getPlan`, `listSkills`, `getSkillVersion`, `addMemory`, `searchMemory`, `upsertChronosRule`, `setVaultSecret`

`src/routes/api/public/`:
- `POST /api/public/ingest` — external webhooks, HMAC verified
- `POST /api/public/cron/chronos` — called by pg_cron every 60s

## Self-heal loop (canonical)

```ts
for (const node of topoSort(plan.dag)) {
  const cached = await lookupSkill(node.tool_name, signatureOf(node.input));
  let code = cached?.code ?? await reasoner.generateSkill(node);
  let lastErr: string | undefined;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await e2b.runPython(code, { env: resolveSecrets(node) });
    await recordRun(node, attempt, result);
    if (result.exit_code === 0) {
      await promoteSkillVersion(node, code, cached);
      break;
    }
    lastErr = result.stderr;
    code = await reasoner.repair(node, code, lastErr, attempt); // Developer-State prompt
  }
  if (!success) markPlanDegraded(plan, node, lastErr);
}
```

## UI (single authenticated dashboard, terminal aesthetic)

Auth: email/password by default (Google later if requested). `_authenticated` layout.

Pages:
- `/` Inbox — live signals + status chips
- `/now` State ledger + "I'm overwhelmed" free-text ingest box
- `/plans/$id` DAG visualizer with per-node stdout/stderr/exit, retry timeline
- `/skills` Skill vault: name, language, success/fail counts, expandable code viewer with version history + diff between attempts
- `/memory` Add/search ontological notes
- `/rules` Chronos rules CRUD
- `/vault` Per-user third-party credentials the sandbox can use
- `/logs` Tail of recent `task_runs` for transparent "Kora thinking" readout

Visuals: dark, JetBrains Mono for code/state, Inter for prose. No marketing decoration.

## Build order

1. Enable Lovable Cloud; create schema + RLS + `vector` + `pg_cron` + `pgcrypto`
2. Auth + `_authenticated` layout + `/login`
3. `add_secret` for `E2B_API_KEY` and `INGEST_HMAC_SECRET`
4. E2B server helper + smoke-test `runPython("print('ok')")` via a temp server fn
5. Memory engine (embed + recall via Lovable AI Gateway)
6. Reasoner: Lovable AI tool-calling → Zod `ExecutionPlan` schema
7. Executor + self-heal loop + skill version promotion
8. `/api/public/ingest` (HMAC) and `/api/public/cron/chronos` + pg_cron job hitting the stable preview URL
9. Vault (encrypted secret store + sandbox injection)
10. Dashboard pages
11. End-to-end demo: "summarize my unread email and tell me what to do first" → no skill exists → LLM writes Python using Gmail API + creds from vault → runs in E2B → fails (missing scope) → self-heals → succeeds → cached as a skill

## What I need from you before I build

1. **E2B account**: I'll prompt you for `E2B_API_KEY` via the secret tool. Confirm you'll provide one (free tier works for dev).
2. **Auth provider**: email/password only, or also Google?
3. **First demo skill domain**: Gmail, calendar, generic shell/web scrape, or your choice — drives which OAuth creds we wire into the vault first.

Approve and I'll execute the full build straight through.
