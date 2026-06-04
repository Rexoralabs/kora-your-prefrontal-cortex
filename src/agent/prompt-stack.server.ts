// Hermes-style 3-layer prompt stack: SOUL → USER → MEMORY → SKILLS → LIVE.
// Builds a single system message anchored by Kora's persistent identity.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { embed } from "./llm.server";
import SOUL_MD from "./prompts/soul.md?raw";

export interface PromptStackArgs {
  userId: string;
  goal: string;
  /** Limit how many memory snippets to inject (default 5). */
  memoryLimit?: number;
  /** Limit how many cached skills to surface (default 4). */
  skillLimit?: number;
}

export interface PromptStack {
  system: string;
  memorySnippets: string[];
  skillHints: { name: string; description: string }[];
}

/**
 * Compose the layered system prompt. Each layer is clearly fenced so the
 * model can attend to the right slice. The SOUL layer is bundled at build
 * time (no runtime read). USER + MEMORY are materialized per call.
 */
export async function buildPromptStack(args: PromptStackArgs): Promise<PromptStack> {
  const { userId, goal } = args;
  const memoryLimit = args.memoryLimit ?? 5;
  const skillLimit = args.skillLimit ?? 4;

  const [profile, state, memorySnippets, skillHints] = await Promise.all([
    fetchProfile(userId),
    fetchState(userId),
    fetchMemory(userId, goal, memoryLimit),
    fetchSkills(userId, skillLimit),
  ]);

  const userMd = renderUserMd(profile, state);
  const memoryMd = memorySnippets.length
    ? memorySnippets.map((s) => `- ${s}`).join("\n")
    : "(no relevant memory yet)";
  const skillsMd = skillHints.length
    ? skillHints.map((s) => `- ${s.name}: ${s.description ?? ""}`).join("\n")
    : "(no learned skills yet)";

  const system = [
    "# SOUL",
    SOUL_MD.trim(),
    "",
    "# USER",
    userMd,
    "",
    "# MEMORY (relevant snippets for this goal)",
    memoryMd,
    "",
    "# SKILLS (procedural memory — past solutions you can reuse)",
    skillsMd,
  ].join("\n");

  return { system, memorySnippets, skillHints };
}

async function fetchProfile(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("display_name, preferences")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

async function fetchState(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_state")
    .select("focus, flags")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

async function fetchMemory(userId: string, query: string, limit: number): Promise<string[]> {
  try {
    const vec = await embed(query);
    // Bypass RLS-bound RPC (uses auth.uid) by querying directly.
    const { data } = await supabaseAdmin.rpc("match_memory_chunks" as any, {
      query_embedding: vec as any,
      match_count: limit,
    });
    const rows = (data ?? []) as Array<{ text: string }>;
    if (rows.length) return rows.map((r) => r.text).filter(Boolean);
    // Fallback: most recent N chunks scoped by user_id
    const { data: recent } = await supabaseAdmin
      .from("memory_chunks")
      .select("text")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return (recent ?? []).map((r) => r.text).filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchSkills(userId: string, limit: number) {
  const { data } = await supabaseAdmin
    .from("skills")
    .select("name, description, success_count")
    .eq("user_id", userId)
    .order("success_count", { ascending: false })
    .limit(limit);
  return (data ?? []).map((s) => ({ name: s.name, description: s.description ?? "" }));
}

function renderUserMd(
  profile: { display_name?: string | null; preferences?: any } | null,
  state: { focus?: string | null; flags?: any } | null,
): string {
  const lines: string[] = [];
  lines.push(`- Name: ${profile?.display_name ?? "(unknown)"}`);
  lines.push(`- Current focus: ${state?.focus ?? "(none set)"}`);
  const prefs = profile?.preferences && typeof profile.preferences === "object" ? profile.preferences : null;
  if (prefs && Object.keys(prefs).length) {
    lines.push(`- Preferences: ${JSON.stringify(prefs)}`);
  }
  const flags = state?.flags && typeof state.flags === "object" ? state.flags : null;
  if (flags && Object.keys(flags).length) {
    lines.push(`- Flags: ${JSON.stringify(flags)}`);
  }
  return lines.join("\n");
}
