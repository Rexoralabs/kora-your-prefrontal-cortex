// Slash command tools — give chat-Kora real, deterministic action.
// /remember <text>  → save a fact to long-term memory
// /focus <text>     → set the current focus on user_state
// /think <goal>     → kick off a thinking-mode plan
// /image <prompt>   → generate an image (Lovable AI nano-banana) into chat
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { embed } from "@/agent/llm.server";
import { reasonAndStartExecution } from "@/lib/agent.functions";

const CommandInput = z.object({
  thread_id: z.string().uuid(),
  command: z.enum(["remember", "focus", "think", "image"]),
  arg: z.string().min(1).max(4000),
});

export const runChatCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CommandInput.parse(i))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { thread_id, command, arg } = data;

    // 1. echo the user's slash command as a user-message (clean text, no `/`)
    const userLabel: Record<typeof command, string> = {
      remember: `Remember: ${arg}`,
      focus: `Focus on: ${arg}`,
      think: arg,
      image: `Generate image: ${arg}`,
    };
    await supabaseAdmin.from("chat_messages").insert({
      thread_id,
      user_id: userId,
      role: "user",
      content: userLabel[command],
    });
    await supabaseAdmin
      .from("chat_threads")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", thread_id)
      .eq("user_id", userId);

    try {
      if (command === "remember") {
        const vec = await embed(arg);
        await supabaseAdmin.from("memory_chunks").insert({
          user_id: userId,
          text: arg,
          embedding: vec as any,
          metadata: { kind: "manual", source: "chat-slash" },
        });
        await insertAssistant(thread_id, userId, `✓ Locked into memory.\n\n> ${arg}`);
        return { ok: true, kind: "remember" as const };
      }

      if (command === "focus") {
        await supabaseAdmin
          .from("user_state")
          .upsert(
            { user_id: userId, focus: arg, last_active: new Date().toISOString() },
            { onConflict: "user_id" },
          );
        await insertAssistant(
          thread_id,
          userId,
          `🎯 Focus set.\n\n**Now:** ${arg}\n\nI'll keep this in mind across every turn.`,
        );
        return { ok: true, kind: "focus" as const };
      }

      if (command === "think") {
        const planId = await reasonAndStartExecution(userId, arg);
        await supabaseAdmin.from("chat_messages").insert({
          thread_id,
          user_id: userId,
          role: "agent",
          content: "",
          plan_id: planId,
        });
        return { ok: true, kind: "think" as const, plan_id: planId };
      }

      if (command === "image") {
        const img = await generateImage(arg);
        const path = `${userId}/gen-${Date.now()}.png`;
        const { error: upErr } = await supabaseAdmin.storage
          .from("chat-uploads")
          .upload(path, img.bytes, { contentType: "image/png", upsert: false });
        if (upErr) throw new Error(`storage: ${upErr.message}`);
        const { data: signed } = await supabaseAdmin.storage
          .from("chat-uploads")
          .createSignedUrl(path, 60 * 60 * 24 * 7);
        const url = signed?.signedUrl;
        if (!url) throw new Error("signed url failed");
        await supabaseAdmin.from("chat_messages").insert({
          thread_id,
          user_id: userId,
          role: "assistant",
          content: img.caption ?? "",
          attachments: [{ url, kind: "image", name: `${arg.slice(0, 40)}.png` }],
          model: "google/gemini-2.5-flash-image",
        });
        return { ok: true, kind: "image" as const, url };
      }
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.error("[kora.cmd]", command, msg);
      await insertAssistant(thread_id, userId, `⚠️ \`/${command}\` failed — ${msg}`);
      return { ok: false, kind: command, error: msg };
    }
    return { ok: false, kind: command, error: "unknown command" };
  });

async function insertAssistant(thread_id: string, user_id: string, content: string) {
  await supabaseAdmin.from("chat_messages").insert({
    thread_id,
    user_id,
    role: "assistant",
    content,
  });
}

/** Call Lovable AI Gateway nano-banana, returns image bytes + optional caption. */
async function generateImage(prompt: string): Promise<{ bytes: Uint8Array; caption?: string }> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      modalities: ["image", "text"],
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`gateway ${res.status}: ${t.slice(0, 200)}`);
  }
  const json: any = await res.json();
  const msg = json.choices?.[0]?.message ?? {};
  // Shape A: { images: [{ image_url: { url: "data:image/png;base64,..." }}] }
  const imageUrl: string | undefined =
    msg.images?.[0]?.image_url?.url ??
    msg.images?.[0]?.url ??
    // Shape B: content is an array of parts
    (Array.isArray(msg.content)
      ? msg.content.find((p: any) => p?.type === "image_url")?.image_url?.url
      : undefined);
  if (!imageUrl || !imageUrl.startsWith("data:")) {
    throw new Error("no image in response");
  }
  const b64 = imageUrl.split(",")[1] ?? "";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const caption = Array.isArray(msg.content)
    ? msg.content.find((p: any) => p?.type === "text")?.text
    : typeof msg.content === "string"
      ? msg.content
      : undefined;
  return { bytes, caption };
}

export const regenerateLastReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ thread_id: z.string().uuid(), message_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    // Delete the assistant message; client then re-streams from the prior user turn.
    const { data: row } = await supabaseAdmin
      .from("chat_messages")
      .select("id, role")
      .eq("id", data.message_id)
      .eq("thread_id", data.thread_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!row || row.role !== "assistant") throw new Error("not an assistant message");
    await supabaseAdmin
      .from("chat_messages")
      .delete()
      .eq("id", data.message_id)
      .eq("user_id", context.userId);
    return { ok: true };
  });
