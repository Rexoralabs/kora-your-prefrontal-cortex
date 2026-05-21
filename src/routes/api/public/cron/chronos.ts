// Chronos daemon endpoint — called by pg_cron every minute.
// Walks active chronos_rules, fires any whose cron matches "now" (minute granularity).
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { reasonAndStartExecution } from "@/lib/agent.functions";

// Tiny cron matcher: supports *, */N, fixed numbers in 5-field crons (min hour dom mon dow).
function matchCron(expr: string, d: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const vals = [d.getUTCMinutes(), d.getUTCHours(), d.getUTCDate(), d.getUTCMonth() + 1, d.getUTCDay()];
  for (let i = 0; i < 5; i++) {
    const f = parts[i];
    const v = vals[i];
    if (f === "*") continue;
    if (f.startsWith("*/")) {
      const step = parseInt(f.slice(2));
      if (!step || v % step !== 0) return false;
      continue;
    }
    if (f.includes(",")) {
      if (!f.split(",").map(Number).includes(v)) return false;
      continue;
    }
    if (parseInt(f) !== v) return false;
  }
  return true;
}

export const Route = createFileRoute("/api/public/cron/chronos")({
  server: {
    handlers: {
      POST: async () => {
        const now = new Date();
        console.log(`[kora.chronos] tick ${now.toISOString()}`);
        const { data: rules } = await supabaseAdmin
          .from("chronos_rules")
          .select("id, user_id, name, cron, trigger_text, enabled, last_fired_at")
          .eq("enabled", true);
        let fired = 0;
        for (const rule of rules ?? []) {
          if (!matchCron(rule.cron, now)) continue;
          // Debounce: don't fire twice in the same minute.
          const last = rule.last_fired_at ? new Date(rule.last_fired_at) : null;
          if (last && now.getTime() - last.getTime() < 55_000) continue;
          console.log(`[kora.chronos] fire rule=${rule.name}`);
          try {
            await reasonAndStartExecution(rule.user_id, rule.trigger_text);
            await supabaseAdmin
              .from("chronos_rules")
              .update({ last_fired_at: now.toISOString() })
              .eq("id", rule.id);
            fired++;
          } catch (e) {
            console.error("[kora.chronos] rule err", rule.id, e);
          }
        }
        return new Response(JSON.stringify({ ok: true, fired, t: now.toISOString() }), {
          headers: { "content-type": "application/json" },
        });
      },
      GET: async () => new Response("ok"),
    },
  },
});
