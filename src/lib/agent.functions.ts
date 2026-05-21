// Server functions exposed to the UI. Auth-protected via requireSupabaseAuth.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { embed } from "@/agent/llm.server";
import { makePlan } from "@/agent/reasoner.server";
import { executePlan } from "@/agent/executor.server";
import { setSecret, listSecretNames, deleteSecret } from "@/agent/vault.server";

export const ingestSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        text: z.string().min(1).max(8000),
        source: z.string().max(50).default("manual"),
        priority: z.enum(["low", "normal", "high"]).default("normal"),
        autorun: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    console.log(`[kora.ingest] user=${userId} text="${data.text.slice(0, 80)}"`);
    const { data: signal, error } = await supabaseAdmin
      .from("signals")
      .insert({
        user_id: userId,
        source: data.source,
        raw_text: data.text,
        priority: data.priority,
        status: "received",
      })
      .select("id")
      .single();
    if (error || !signal) throw new Error(error?.message ?? "insert signal failed");

    if (!data.autorun) return { signal_id: signal.id, plan_id: null };

    const planId = await reasonAndStartExecution(userId, data.text, signal.id);
    return { signal_id: signal.id, plan_id: planId };
  });

export async function reasonAndStartExecution(userId: string, goal: string, signalId?: string): Promise<string> {
  // Pull context
  const [{ data: stateRow }, secretNames, memSnips] = await Promise.all([
    supabaseAdmin.from("user_state").select("focus, flags").eq("user_id", userId).maybeSingle(),
    listSecretNames(userId),
    fetchMemorySnippets(userId, goal),
  ]);
  const state = { focus: stateRow?.focus ?? null, flags: (stateRow?.flags as any) ?? {} };

  const plan = await makePlan({ goal, memorySnippets: memSnips, availableSecrets: secretNames, userState: state });

  const { data: planRow, error } = await supabaseAdmin
    .from("execution_plans")
    .insert({
      user_id: userId,
      signal_id: signalId ?? null,
      goal: plan.goal,
      dag: plan as any,
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !planRow) throw new Error(error?.message ?? "insert plan failed");

  if (signalId) {
    await supabaseAdmin.from("signals").update({ status: "planned" }).eq("id", signalId);
  }

  // Kick execution. Best-effort fire-and-forget within the request lifetime.
  // On Workers we await it to stay inside the request — UI polls for updates.
  executePlan(userId, planRow.id, plan).catch((e) => console.error("[kora.exec] crash", e));

  return planRow.id;
}

async function fetchMemorySnippets(userId: string, goal: string): Promise<string[]> {
  try {
    const vec = await embed(goal);
    const { data } = await supabaseAdmin.rpc("match_memory_chunks" as any, {
      query_embedding: vec as any,
      match_count: 5,
    });
    return ((data ?? []) as Array<{ text: string }>)
      .map((r) => r.text)
      .filter(Boolean);
  } catch (e) {
    console.warn("[kora.mem] snippets fail", (e as any)?.message);
    return [];
  }
}

export const listSignals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("signals")
      .select("id, source, raw_text, priority, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });

export const listPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("execution_plans")
      .select("id, goal, status, error, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    return data ?? [];
  });

export const getPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: plan } = await context.supabase
      .from("execution_plans")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!plan) return null;
    const { data: runs } = await context.supabase
      .from("task_runs")
      .select("id, node_id, tool_name, status, attempt, exit_code, stdout, stderr, output, duration_ms, created_at")
      .eq("plan_id", data.id)
      .order("created_at");
    return { plan, runs: runs ?? [] };
  });

export const listSkills = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: skills } = await context.supabase
      .from("skills")
      .select("id, name, description, language, success_count, fail_count, active_version_id, created_at")
      .order("created_at", { ascending: false });
    if (!skills) return [];
    const ids = skills.map((s) => s.active_version_id).filter(Boolean) as string[];
    const codes: Record<string, string> = {};
    if (ids.length) {
      const { data: vers } = await context.supabase
        .from("skill_versions")
        .select("id, code")
        .in("id", ids);
      for (const v of vers ?? []) codes[v.id] = v.code;
    }
    return skills.map((s) => ({ ...s, code: s.active_version_id ? codes[s.active_version_id] ?? null : null }));
  });

export const listMemory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("memory_chunks")
      .select("id, text, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

export const addMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ text: z.string().min(1).max(4000) }).parse(i))
  .handler(async ({ data, context }) => {
    const vec = await embed(data.text);
    const { error } = await supabaseAdmin.from("memory_chunks").insert({
      user_id: context.userId,
      text: data.text,
      embedding: vec as any,
      metadata: { kind: "manual" },
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getUserState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_state")
      .select("focus, flags, last_active, updated_at")
      .maybeSingle();
    return data ?? { focus: null, flags: {}, last_active: null, updated_at: null };
  });

export const setUserState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ focus: z.string().max(400).nullable() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await supabaseAdmin
      .from("user_state")
      .upsert(
        { user_id: context.userId, focus: data.focus, last_active: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    return { ok: true };
  });

export const listVaultNames = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => listSecretNames(context.userId));

export const setVaultSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        name: z
          .string()
          .min(1)
          .max(64)
          .regex(/^[A-Z][A-Z0-9_]*$/, "Use SCREAMING_SNAKE_CASE"),
        value: z.string().min(1).max(8000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await setSecret(context.userId, data.name, data.value);
    return { ok: true };
  });

export const removeVaultSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ name: z.string().min(1).max(64) }).parse(i))
  .handler(async ({ data, context }) => {
    await deleteSecret(context.userId, data.name);
    return { ok: true };
  });

export const listChronosRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("chronos_rules")
      .select("*")
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const upsertChronosRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(80),
        cron: z.string().min(1).max(40),
        trigger_text: z.string().min(1).max(1000),
        enabled: z.boolean().default(true),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    if (data.id) {
      await supabaseAdmin
        .from("chronos_rules")
        .update({ name: data.name, cron: data.cron, trigger_text: data.trigger_text, enabled: data.enabled })
        .eq("id", data.id)
        .eq("user_id", context.userId);
    } else {
      await supabaseAdmin.from("chronos_rules").insert({
        user_id: context.userId,
        name: data.name,
        cron: data.cron,
        trigger_text: data.trigger_text,
        enabled: data.enabled,
      });
    }
    return { ok: true };
  });

export const deleteChronosRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await supabaseAdmin.from("chronos_rules").delete().eq("id", data.id).eq("user_id", context.userId);
    return { ok: true };
  });

export const listTaskRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("task_runs")
      .select("id, plan_id, node_id, tool_name, status, attempt, exit_code, duration_ms, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });
