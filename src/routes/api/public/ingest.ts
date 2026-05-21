// Public webhook ingestion endpoint. HMAC-verified.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { reasonAndStartExecution } from "@/lib/agent.functions";

async function verifyHmac(body: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const secret = process.env.INGEST_HMAC_SECRET;
  if (!secret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // constant-time compare
  if (signature.length !== hex.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        const sig = request.headers.get("x-kora-signature");
        if (!(await verifyHmac(body, sig))) {
          return new Response(JSON.stringify({ error: "invalid signature" }), { status: 401 });
        }
        let payload: any;
        try { payload = JSON.parse(body); } catch {
          return new Response(JSON.stringify({ error: "bad json" }), { status: 400 });
        }
        const { user_id, text, source = "webhook", priority = "normal", autorun = true } = payload ?? {};
        if (!user_id || !text) {
          return new Response(JSON.stringify({ error: "user_id and text required" }), { status: 400 });
        }
        console.log(`[kora.public.ingest] user=${user_id} source=${source}`);
        const { data: signal, error } = await supabaseAdmin
          .from("signals")
          .insert({ user_id, source, raw_text: text, priority, status: "received" })
          .select("id")
          .single();
        if (error || !signal) {
          return new Response(JSON.stringify({ error: error?.message ?? "insert failed" }), { status: 500 });
        }
        let planId: string | null = null;
        if (autorun) {
          try {
            planId = await reasonAndStartExecution(user_id, text, signal.id);
          } catch (e) {
            console.error("[kora.public.ingest] plan err", e);
          }
        }
        return new Response(JSON.stringify({ signal_id: signal.id, plan_id: planId }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
