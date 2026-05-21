// Executor: topo-sorts DAG, runs each node in E2B with self-heal (max 3 attempts).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { embed } from "./llm.server";
import { runPython } from "./sandbox.server";
import { generateSkillCode, type ExecutionPlan, type PlanNode } from "./reasoner.server";
import { resolveSecrets } from "./vault.server";

const MAX_ATTEMPTS = 3;

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

export async function executePlan(userId: string, planId: string, plan: ExecutionPlan): Promise<void> {
  console.log(`[kora.exec] plan=${planId} nodes=${plan.nodes.length}`);
  await supabaseAdmin.from("execution_plans").update({ status: "running" }).eq("id", planId);

  const ordered = topoSort(plan.nodes);
  const nodeOutputs: Record<string, { stdout: string; output: any }> = {};
  let planFailed = false;
  let planError: string | undefined;

  for (const node of ordered) {
    const sigHash = signatureOf(node);
    // Lookup cached skill
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
    let succeeded = false;
    let lastStdout = "";
    let lastStderr = "";
    let requirements: string | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (!code) {
        const gen = await generateSkillCode({
          node,
          goal: plan.goal,
          upstreamNodes: ordered.filter((n) => node.depends_on.includes(n.id)),
          priorAttempt: attempt > 1 ? { code: code ?? "", stderr: lastStderr, stdout: lastStdout } : undefined,
        });
        code = gen.code;
        requirements = gen.requirements;
      }

      console.log(`[kora.exec] run node=${node.id} attempt=${attempt}`);
      const result = await runPython(code!, { env: baseEnv, requirements: requirements, timeoutMs: 90_000 });
      lastStdout = result.stdout;
      lastStderr = result.stderr;

      const finalOutput = result.exit_code === 0 ? extractFinalOutput(result.stdout) : null;

      // Persist task_run
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
        succeeded = true;
        nodeOutputs[node.id] = { stdout: result.stdout, output: finalOutput };
        // Promote/cache skill version
        await promoteSkill({ userId, node, sigHash, code: code!, cachedSkillId: cachedSkill?.id, parentVersionId: cachedSkill?.active_version_id });
        console.log(`[kora.exec] OK node=${node.id} attempt=${attempt}`);
        break;
      } else {
        console.warn(`[kora.exec] FAIL node=${node.id} attempt=${attempt} stderr=${result.stderr.slice(-400)}`);
        // Force regen on next attempt
        code = undefined;
      }
    }

    if (!succeeded) {
      planFailed = true;
      planError = `node ${node.id} (${node.name}) failed after ${MAX_ATTEMPTS} attempts: ${lastStderr.slice(-400)}`;
      if (cachedSkill?.id) {
        await supabaseAdmin
          .from("skills")
          .update({ fail_count: (cachedSkill.fail_count ?? 0) + 1 })
          .eq("id", cachedSkill.id);
      }
      break;
    }
  }

  await supabaseAdmin
    .from("execution_plans")
    .update({ status: planFailed ? "failed" : "succeeded", error: planError })
    .eq("id", planId);

  // Best-effort: store a memory chunk of what we did
  try {
    const summary = `Goal: ${plan.goal}. Outcome: ${planFailed ? "FAILED — " + planError : "succeeded"}.`;
    const vec = await embed(summary);
    await supabaseAdmin.from("memory_chunks").insert({
      user_id: userId,
      text: summary,
      embedding: vec as any,
      metadata: { plan_id: planId, kind: "plan_outcome" },
    });
  } catch (e) {
    console.warn("[kora.exec] memory persist failed", (e as any)?.message);
  }
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
