// Lovable AI Gateway helper (server-only).
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const EMBED = "https://ai.gateway.lovable.dev/v1/embeddings";

export const DEFAULT_MODEL = "google/gemini-3-flash-preview";
export const REASONER_MODEL = "google/gemini-2.5-pro";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: any[];
  name?: string;
}

export interface ChatOptions {
  model?: string;
  messages: ChatMessage[];
  tools?: any[];
  tool_choice?: any;
  temperature?: number;
}

export async function chat(opts: ChatOptions): Promise<any> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const t0 = Date.now();
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: opts.model ?? DEFAULT_MODEL, ...opts }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error(`[kora.llm] ${res.status} ${t.slice(0, 400)}`);
    if (res.status === 429) throw new Error("AI rate limit, try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted; top up your Lovable workspace.");
    throw new Error(`AI gateway error ${res.status}`);
  }
  const json = (await res.json()) as any;
  console.log(`[kora.llm] ${opts.model ?? DEFAULT_MODEL} ${Date.now() - t0}ms`);
  return json;
}

export async function embed(text: string): Promise<number[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch(EMBED, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-embedding-001", input: text, dimensions: 768 }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`embed error ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as any;
  return json.data[0].embedding as number[];
}
