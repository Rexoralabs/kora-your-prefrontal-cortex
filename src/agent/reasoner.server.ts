// Reasoner: turns a signal + context into an ExecutionPlan DAG of skill nodes.
import { z } from "zod";
import { chat, REASONER_MODEL } from "./llm.server";

export const PlanNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  depends_on: z.array(z.string()).default([]),
  required_secrets: z.array(z.string()).default([]),
  inputs: z.record(z.string(), z.any()).default({}),
  // When set, this node is delegated to a SUB-AGENT (nested reasoner+executor)
  // instead of running a single Python skill. The sub-agent receives `subgoal`
  // as its own goal and its final aggregated stdout becomes this node's output.
  subgoal: z.string().nullable().optional(),
});
export type PlanNode = z.infer<typeof PlanNodeSchema>;

export const ExecutionPlanSchema = z.object({
  goal: z.string(),
  reasoning: z.string(),
  nodes: z.array(PlanNodeSchema).min(1).max(8),
});
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

const SYSTEM = `You are the Reasoning Cortex of Project Kora, an autonomous personal assistant that acts as an externalized prefrontal cortex.

You decompose a user signal into a small DAG (1-6 nodes). Each node is one of:
  (a) an ATOMIC Python skill — code-generated and executed in an isolated E2B Linux micro-VM with full internet access.
  (b) a DELEGATED sub-goal — handed to a child reasoner that plans + executes it recursively. Use (b) when a step itself naturally decomposes into multiple sub-steps (e.g. "research the top 5 competitors and summarize" — that is a sub-goal, not a single skill).

Rules:
- Prefer the smallest viable plan. One node is fine if it suffices.
- Each node "name" is snake_case (e.g. "fetch_unread_email", "research_competitors").
- depends_on lists node ids whose stdout this node consumes via stdin or env.
- required_secrets are user-vault secret names. Do not invent secrets the user has not provided unless necessary.
- "inputs" is a small JSON object passed to the skill at runtime (kept as KORA_INPUT env var).
- For a delegated node, set "subgoal" to a clear standalone instruction for the child agent and leave required_secrets empty. Do not also write Python for it.
- Delegate sparingly — at most one or two sub-goals per plan, never if a single skill would do.
- "reasoning" is one short paragraph explaining the plan to the user, in second person.
- Respond ONLY via the emit_plan tool call. No prose.`;

export async function makePlan(args: {
  goal: string;
  memorySnippets: string[];
  availableSecrets: string[];
  userState: { focus: string | null; flags: Record<string, any> };
}): Promise<ExecutionPlan> {
  const userMsg = [
    `# Goal\n${args.goal}`,
    `# Current user focus\n${args.userState.focus ?? "(none set)"}`,
    `# Available vault secrets\n${args.availableSecrets.length ? args.availableSecrets.join(", ") : "(none)"}`,
    `# Relevant memory\n${args.memorySnippets.length ? args.memorySnippets.map((s, i) => `- ${s}`).join("\n") : "(empty)"}`,
  ].join("\n\n");

  const tool = {
    type: "function",
    function: {
      name: "emit_plan",
      description: "Emit a structured ExecutionPlan.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string" },
          reasoning: { type: "string" },
          nodes: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                description: { type: "string" },
                depends_on: { type: "array", items: { type: "string" } },
                required_secrets: { type: "array", items: { type: "string" } },
                inputs: { type: "object", additionalProperties: true },
                subgoal: { type: ["string", "null"], description: "If set, delegate this node to a child agent with this sub-goal instead of writing Python." },
              },
              required: ["id", "name", "description"],
              additionalProperties: false,
            },
          },
        },
        required: ["goal", "reasoning", "nodes"],
        additionalProperties: false,
      },
    },
  };

  const res = await chat({
    model: REASONER_MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userMsg },
    ],
    tools: [tool],
    tool_choice: { type: "function", function: { name: "emit_plan" } },
  });

  const call = res.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("Reasoner returned no tool call");
  const args2 = typeof call.function.arguments === "string"
    ? JSON.parse(call.function.arguments)
    : call.function.arguments;
  const parsed = ExecutionPlanSchema.parse(args2);
  console.log(`[kora.reason] plan goal="${parsed.goal}" nodes=${parsed.nodes.length}`);
  return parsed;
}

const CODER_SYSTEM = `You are the Developer Cortex of Project Kora. Your job is to write a SINGLE self-contained Python 3 script that performs the requested skill inside an ephemeral Linux micro-VM (E2B sandbox) with internet access.

Rules:
- Read inputs from env var KORA_INPUT (JSON string).
- Read upstream node outputs from env vars KORA_DEP_<NODE_ID> (each is the raw stdout text of that node).
- Read user-vault secrets from env vars matching their names (e.g. os.environ["GMAIL_OAUTH_TOKEN"]).
- Print FINAL structured output as the LAST line, prefixed with "KORA_OUTPUT: " followed by compact JSON. You may print human-readable logs above.
- Use only requests, beautifulsoup4, lxml, pandas (and stdlib). If you need anything else, add to the requirements list.
- Fail loudly with a non-zero exit on errors (raise SystemExit("...")).
- Keep code under ~80 lines. No placeholders, no TODOs.

Respond ONLY via the emit_skill tool call.`;

export const SkillCodeSchema = z.object({
  code: z.string().min(20),
  requirements: z.string().default(""),
  explanation: z.string().default(""),
});
export type SkillCode = z.infer<typeof SkillCodeSchema>;

export async function generateSkillCode(args: {
  node: PlanNode;
  goal: string;
  upstreamNodes: PlanNode[];
  priorAttempt?: { code: string; stderr: string; stdout: string };
}): Promise<SkillCode> {
  const upstream = args.upstreamNodes
    .map((n) => `- ${n.id} (${n.name}): ${n.description}`)
    .join("\n");
  const repair = args.priorAttempt
    ? `\n\n# Prior failing attempt — DO NOT REPEAT THE MISTAKE\nCODE:\n${args.priorAttempt.code}\n\nSTDOUT:\n${args.priorAttempt.stdout.slice(-1200)}\n\nSTDERR:\n${args.priorAttempt.stderr.slice(-1800)}\n\nFix the root cause and emit corrected code.`
    : "";

  const tool = {
    type: "function",
    function: {
      name: "emit_skill",
      description: "Emit a Python script that implements the skill.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "Full Python source." },
          requirements: { type: "string", description: "Newline-separated pip packages, or empty." },
          explanation: { type: "string" },
        },
        required: ["code"],
        additionalProperties: false,
      },
    },
  };

  const userMsg = `# Overall goal\n${args.goal}\n\n# This node\nid: ${args.node.id}\nname: ${args.node.name}\ndescription: ${args.node.description}\ninputs: ${JSON.stringify(args.node.inputs)}\nrequired_secrets: ${args.node.required_secrets.join(", ") || "(none)"}\n\n# Upstream nodes\n${upstream || "(none)"}${repair}`;

  const res = await chat({
    model: REASONER_MODEL,
    messages: [
      { role: "system", content: CODER_SYSTEM },
      { role: "user", content: userMsg },
    ],
    tools: [tool],
    tool_choice: { type: "function", function: { name: "emit_skill" } },
  });
  const call = res.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("Coder returned no tool call");
  const parsed = SkillCodeSchema.parse(
    typeof call.function.arguments === "string"
      ? JSON.parse(call.function.arguments)
      : call.function.arguments,
  );
  console.log(`[kora.coder] generated ${parsed.code.length}b for ${args.node.name}${args.priorAttempt ? " (repair)" : ""}`);
  return parsed;
}
