// Executor: topo-sorts DAG, runs each node in E2B with self-heal (max 3 attempts).
// Supports sub-agent orchestration: a node with `subgoal` is delegated to a
// nested reasoner+executor instead of running a single Python skill.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { embed } from "./llm.server";
import { runPython } from "./sandbox.server";
import { generateSkillCode, makePlan, type ExecutionPlan, type PlanNode } from "./reasoner.server";
import { resolveSecrets, listSecretNames } from "./vault.server";

const MAX_ATTEMPTS = 3;
const MAX_SUBAGENT_DEPTH = 2;

function signatureOf(node: PlanNode): string {
  const sig = JSON.stringify({ name: node.name, inputs: Object.keys(node.inputs).sort() });
  // Simple FNV-1a hash to avoid bringing crypto for content sig
  let h = 0x811c9dc5;
  for (let i = 0; i < sig.length; i++) {
    h ^= sig.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function topoSort(nodes: PlanNode[]): PlanNode[] {
  const map = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const out: PlanNode[] = [];
  function visit(id: string, stack: string[]) {
    if (visited.has(id)) return;
    if (stack.includes(id)) throw new Error(`cycle in DAG at ${id}`);
    const n = map.get(id);
    if (!n) return;
    for (const dep of n.depends_on) visit(dep, [...stack, id]);
    visited.add(id);
    out.push(n);
  }
  for (const n of nodes) visit(n.id, []);
  return out;
}

function extractFinalOutput(stdout: string): any {
  const lines = stdout.trim().split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^KORA_OUTPUT:\s*(.+)$/);
    if (m) {
      try { return JSON.parse(m[1]); } catch { return m[1]; }
    }
  }
  return stdout.trim().slice(-2000);
}

export async function executePlan(
  userId: string,
  planId: string,
  plan: ExecutionPlan,
  depth = 0,
): Promise<void> {
  console.log(`[kora.exec] plan=${planId} nodes=${plan.nodes.length} depth=${depth}`);
  await supabaseAdmin.from("execution_plans").update({ status: "running" }).eq("id", planId);

  const ordered = topoSort(plan.nodes);
  const nodeOutputs: Record<string, { stdout: string; output: any }> = {};
  let planFailed = false;
  let planError: string | undefined;

  // ─── Parallel fan-out by topological level ────────────────────────────────
  // Group ready nodes (all deps satisfied) and run them concurrently. This is
  // the "Dynamic Workflows" pattern — each node has its own isolated context;
  // only their compact outputs are aggregated back.
  const remaining = new Set(ordered.map((n) => n.id));
  const nodeById = new Map(ordered.map((n) => [n.id, n]));

  while (remaining.size && !planFailed) {
    const ready: PlanNode[] = [];
    for (const id of remaining) {
      const n = nodeById.get(id)!;
      if (n.depends_on.every((d) => nodeOutputs[d] !== undefined)) ready.push(n);
    }
    if (!ready.length) {
      planFailed = true;
      planError = "deadlock: no ready nodes but plan incomplete";
      break;
    }

    const results = await Promise.all(
      ready.map((node) => executeOneNode({ userId, planId, plan, node, depth, nodeOutputs })),
    );

    for (let i = 0; i < ready.length; i++) {
      const node = ready[i];
      const res = results[i];
      remaining.delete(node.id);
      if (res.ok) {
        nodeOutputs[node.id] = { stdout: res.stdout, output: res.output };
      } else {
        planFailed = true;
        planError = `node ${node.id} (${node.name}): ${res.error}`;
      }
    }
  }

  // ─── Adversarial verifier pass ────────────────────────────────────────────
  // Spend one cheap LLM call to try and refute the synthesized result. If it
  // raises a high-confidence objection, we mark the plan with that flag so
  // the UI + future runs can learn from it. Skipped on failed/empty plans.
  let verification: { passed: boolean; critique: string } | null = null;
  if (!planFailed && Object.keys(nodeOutputs).length) {
    try {
      verification = await adversarialVerify(plan, nodeOutputs);
    } catch (e) {
      console.warn("[kora.verify] failed", (e as any)?.message);
    }
  }

  await supabaseAdmin
    .from("execution_plans")
    .update({
      status: planFailed ? "failed" : "succeeded",
      error: planError,
      dag: { ...plan, verification } as any,
    })
    .eq("id", planId);

  // Best-effort: store a memory chunk of what we did (Hermes-style playbook).
  try {
    const summary = `Goal: ${plan.goal}. Outcome: ${planFailed ? "FAILED — " + planError : "succeeded"}.${verification ? " Verifier: " + (verification.passed ? "passed" : "objected — " + verification.critique.slice(0, 240)) : ""}`;
    const vec = await embed(summary);
    await supabaseAdmin.from("memory_chunks").insert({
      user_id: userId,
      text: summary,
      embedding: vec as any,
      metadata: { plan_id: planId, kind: "playbook" },
    });
  } catch (e) {
    console.warn("[kora.exec] memory persist failed", (e as any)?.message);
  }
}

// ─── Single-node executor (skill or subagent) ────────────────────────────────
async function executeOneNode(args: {
  userId: string;
  planId: string;
  plan: ExecutionPlan;
  node: PlanNode;
  depth: number;
  nodeOutputs: Record<string, { stdout: string; output: any }>;
}): Promise<{ ok: true; stdout: string; output: any } | { ok: false; error: string }> {
  const { userId, planId, plan, node, depth, nodeOutputs } = args;

  if (node.subgoal && node.subgoal.trim()) {
    const subResult = await runSubAgent({
      userId,
      parentPlanId: planId,
      node,
      depth,
      upstream: nodeOutputs,
    });
    return subResult;
  }

  const sigHash = signatureOf(node);
  const { data: cachedSkill } = await supabaseAdmin
    .from("skills")
    .select("id, active_version_id, success_count, fail_count")
    .eq("user_id", userId)
    .eq("signature_hash", sigHash)
    .maybeSingle();

  let priorCode: string | undefined;
  if (cachedSkill?.active_version_id) {
    const { data: ver } = await supabaseAdmin
      .from("skill_versions")
      .select("code")
      .eq("id", cachedSkill.active_version_id)
      .maybeSingle();
    priorCode = ver?.code;
    console.log(`[kora.exec] node=${node.id} using cached skill ${cachedSkill.id}`);
  }

  const secretEnv = await resolveSecrets(userId, node.required_secrets);
  const depEnv: Record<string, string> = {};
  for (const dep of node.depends_on) {
    const out = nodeOutputs[dep];
    if (out) depEnv[`KORA_DEP_${dep.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`] = out.stdout.slice(-8000);
  }
  const baseEnv: Record<string, string> = {
    ...secretEnv,
    ...depEnv,
    KORA_INPUT: JSON.stringify(node.inputs ?? {}),
    KORA_NODE_NAME: node.name,
  };

  let code = priorCode;
  let lastStdout = "";
  let lastStderr = "";
  let requirements: string | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (!code) {
      const gen = await generateSkillCode({
        node,
        goal: plan.goal,
        upstreamNodes: plan.nodes.filter((n) => node.depends_on.includes(n.id)),
        priorAttempt: attempt > 1 ? { code: code ?? "", stderr: lastStderr, stdout: lastStdout } : undefined,
      });
      code = gen.code;
      requirements = gen.requirements;
    }

    console.log(`[kora.exec] run node=${node.id} attempt=${attempt}`);
    const result = await runPython(code!, { env: baseEnv, requirements, timeoutMs: 90_000 });
    lastStdout = result.stdout;
    lastStderr = result.stderr;

    const finalOutput = result.exit_code === 0 ? extractFinalOutput(result.stdout) : null;

    await supabaseAdmin.from("task_runs").insert({
      user_id: userId,
      plan_id: planId,
      node_id: node.id,
      tool_name: node.name,
      input: node.inputs as any,
      output: finalOutput,
      stdout: result.stdout.slice(0, 16_000),
      stderr: result.stderr.slice(0, 16_000),
      exit_code: result.exit_code,
      status: result.exit_code === 0 ? "ok" : "error",
      attempt,
      duration_ms: result.duration_ms,
    });

    if (result.exit_code === 0) {
      await promoteSkill({
        userId,
        node,
        sigHash,
        code: code!,
        cachedSkillId: cachedSkill?.id,
        parentVersionId: cachedSkill?.active_version_id,
      });
      console.log(`[kora.exec] OK node=${node.id} attempt=${attempt}`);
      return { ok: true, stdout: result.stdout, output: finalOutput };
    }
    console.warn(`[kora.exec] FAIL node=${node.id} attempt=${attempt} stderr=${result.stderr.slice(-400)}`);
    code = undefined; // force regen
  }

  if (cachedSkill?.id) {
    await supabaseAdmin
      .from("skills")
      .update({ fail_count: (cachedSkill.fail_count ?? 0) + 1 })
      .eq("id", cachedSkill.id);
  }
  return { ok: false, error: `failed after ${MAX_ATTEMPTS} attempts: ${lastStderr.slice(-400)}` };
}

// ─── Adversarial verifier ────────────────────────────────────────────────────
// Cheap, independent LLM call whose explicit job is to refute the plan's
// outputs. We use a small/fast model so this stays under ~1s and doesn't bloat
// token spend. Returns {passed:true} when the verifier finds no objection.
async function adversarialVerify(
  plan: ExecutionPlan,
  outputs: Record<string, { stdout: string; output: any }>,
): Promise<{ passed: boolean; critique: string }> {
  // Lazy import to keep the executor module client-graph-safe.
  const { chat, DEFAULT_MODEL } = await import("./llm.server");
  const summary = Object.entries(outputs)
    .map(([id, o]) => `# ${id}\n${JSON.stringify(o.output).slice(0, 800)}`)
    .join("\n\n");
  const sys = `You are an adversarial verifier. Your only job is to find a concrete reason the plan's outputs DO NOT satisfy the goal. Be specific. If everything checks out, reply with exactly the token PASSED. Otherwise reply with a single short paragraph explaining the strongest objection.`;
  const user = `# Goal\n${plan.goal}\n\n# Outputs (per node)\n${summary}`;
  const res = await chat({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    temperature: 0.2,
  });
  const text = (res.choices?.[0]?.message?.content ?? "").trim();
  const passed = /^PASSED\b/i.test(text);
  return { passed, critique: passed ? "" : text };
}


async function promoteSkill(args: {
  userId: string;
  node: PlanNode;
  sigHash: string;
  code: string;
  cachedSkillId?: string;
  parentVersionId?: string | null;
}) {
  let skillId = args.cachedSkillId;
  if (!skillId) {
    const { data: skill, error } = await supabaseAdmin
      .from("skills")
      .insert({
        user_id: args.userId,
        name: args.node.name,
        description: args.node.description,
        signature_hash: args.sigHash,
        language: "python",
        network_policy: {} as any,
      })
      .select("id")
      .single();
    if (error || !skill) {
      console.warn("[kora.exec] promoteSkill insert err", error?.message);
      return;
    }
    skillId = skill.id;
  }
  const { data: ver } = await supabaseAdmin
    .from("skill_versions")
    .insert({
      user_id: args.userId,
      skill_id: skillId!,
      code: args.code,
      generated_by_model: "google/gemini-2.5-pro",
      parent_version_id: args.parentVersionId ?? null,
      validated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (ver) {
    await supabaseAdmin
      .from("skills")
      .update({ active_version_id: ver.id, success_count: 1 })
      .eq("id", skillId!);
  }
}

// ─── Sub-agent orchestration ─────────────────────────────────────────────────
// A delegated node spins up its OWN execution_plans row (linked to the parent
// via dag.parent_plan_id), reasons a child plan, executes it, and returns the
// last node's stdout/output as this node's result. Capped at MAX_SUBAGENT_DEPTH.
async function runSubAgent(args: {
  userId: string;
  parentPlanId: string;
  node: PlanNode;
  depth: number;
  upstream: Record<string, { stdout: string; output: any }>;
}): Promise<{ ok: true; stdout: string; output: any } | { ok: false; error: string }> {
  const { userId, parentPlanId, node, depth, upstream } = args;
  const t0 = Date.now();

  if (depth >= MAX_SUBAGENT_DEPTH) {
    const msg = `max sub-agent depth ${MAX_SUBAGENT_DEPTH} reached`;
    await supabaseAdmin.from("task_runs").insert({
      user_id: userId,
      plan_id: parentPlanId,
      node_id: node.id,
      tool_name: `subagent:${node.name}`,
      input: { subgoal: node.subgoal } as any,
      stderr: msg,
      exit_code: 1,
      status: "error",
      attempt: 1,
      duration_ms: 0,
    });
    return { ok: false, error: msg };
  }

  // Pull tiny context for the child reasoner.
  const [{ data: stateRow }, secretNames] = await Promise.all([
    supabaseAdmin.from("user_state").select("focus, flags").eq("user_id", userId).maybeSingle(),
    listSecretNames(userId),
  ]);
  const upstreamHint = node.depends_on
    .map((id) => `- ${id}: ${(upstream[id]?.stdout ?? "").slice(-600)}`)
    .filter(Boolean)
    .join("\n");
  const enrichedGoal = upstreamHint
    ? `${node.subgoal}\n\n# Upstream context\n${upstreamHint}`
    : node.subgoal!;

  let childPlan;
  try {
    childPlan = await makePlan({
      goal: enrichedGoal,
      memorySnippets: [],
      availableSecrets: secretNames,
      userState: { focus: stateRow?.focus ?? null, flags: (stateRow?.flags as any) ?? {} },
    });
  } catch (e: any) {
    return { ok: false, error: `child reasoner: ${e?.message ?? "failed"}` };
  }

  const { data: childRow, error: insErr } = await supabaseAdmin
    .from("execution_plans")
    .insert({
      user_id: userId,
      goal: childPlan.goal,
      dag: { ...childPlan, parent_plan_id: parentPlanId, parent_node_id: node.id, depth: depth + 1 } as any,
      status: "pending",
    })
    .select("id")
    .single();
  if (insErr || !childRow) return { ok: false, error: insErr?.message ?? "insert child plan" };

  // Record a parent-side task_run so the UI shows the delegation in the trace.
  await supabaseAdmin.from("task_runs").insert({
    user_id: userId,
    plan_id: parentPlanId,
    node_id: node.id,
    tool_name: `subagent:${node.name}`,
    input: { subgoal: node.subgoal, child_plan_id: childRow.id } as any,
    status: "running",
    attempt: 1,
  });

  try {
    await executePlan(userId, childRow.id, childPlan, depth + 1);
  } catch (e: any) {
    const msg = e?.message ?? "child executor crashed";
    await supabaseAdmin.from("task_runs").insert({
      user_id: userId,
      plan_id: parentPlanId,
      node_id: node.id,
      tool_name: `subagent:${node.name}`,
      input: { child_plan_id: childRow.id } as any,
      stderr: msg,
      exit_code: 1,
      status: "error",
      attempt: 1,
      duration_ms: Date.now() - t0,
    });
    return { ok: false, error: msg };
  }

  // Aggregate the child's last node output as this delegated node's result.
  const { data: childPlanRow } = await supabaseAdmin
    .from("execution_plans")
    .select("status, error")
    .eq("id", childRow.id)
    .maybeSingle();
  const { data: childRuns } = await supabaseAdmin
    .from("task_runs")
    .select("node_id, stdout, output, status")
    .eq("plan_id", childRow.id)
    .order("created_at", { ascending: false })
    .limit(8);

  const lastOk = (childRuns ?? []).find((r) => r.status === "ok");
  const aggregated = {
    child_plan_id: childRow.id,
    child_status: childPlanRow?.status ?? "unknown",
    last_output: lastOk?.output ?? null,
  };
  const stdout = lastOk?.stdout ?? JSON.stringify(aggregated);

  await supabaseAdmin.from("task_runs").insert({
    user_id: userId,
    plan_id: parentPlanId,
    node_id: node.id,
    tool_name: `subagent:${node.name}`,
    input: { child_plan_id: childRow.id } as any,
    output: aggregated as any,
    stdout: stdout.slice(0, 16_000),
    status: childPlanRow?.status === "succeeded" ? "ok" : "error",
    exit_code: childPlanRow?.status === "succeeded" ? 0 : 1,
    attempt: 1,
    duration_ms: Date.now() - t0,
  });

  if (childPlanRow?.status !== "succeeded") {
    return { ok: false, error: childPlanRow?.error ?? "child plan did not succeed" };
  }
  return { ok: true, stdout, output: aggregated };
}
