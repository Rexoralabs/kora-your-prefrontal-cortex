import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { listChronosRules, upsertChronosRule, deleteChronosRule } from "@/lib/agent.functions";
import { ModuleShell, ModuleError } from "@/components/ModuleShell";

const rulesQO = queryOptions({ queryKey: ["rules"], queryFn: () => listChronosRules() });

export const Route = createFileRoute("/_authenticated/rules")({
  loader: ({ context }) => context.queryClient.ensureQueryData(rulesQO),
  component: RulesPage,
  errorComponent: ModuleError,
});

function RulesPage() {
  const { data: rules } = useSuspenseQuery(rulesQO);
  const upsert = useServerFn(upsertChronosRule);
  const del = useServerFn(deleteChronosRule);
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", cron: "0 9 * * *", trigger_text: "" });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await upsert({ data: { ...form, enabled: true } });
      setForm({ name: "", cron: "0 9 * * *", trigger_text: "" });
      qc.invalidateQueries({ queryKey: ["rules"] });
      toast.success("Rule saved — Chronos will tick it");
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <ModuleShell
      eyebrow="Chronos"
      title="Rules & Schedules"
      caption={<>Proactive triggers. Cron is UTC, 5-field — polled every minute.</>}
    >
      <form onSubmit={save} className="glass rounded-2xl p-3">
        <div className="grid gap-2 md:grid-cols-[1fr_140px_2fr_auto]">
          <input
            required placeholder="Name"
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="field rounded-xl px-3 py-2.5 text-[13px] outline-none"
          />
          <input
            required placeholder="0 9 * * *"
            value={form.cron} onChange={(e) => setForm({ ...form, cron: e.target.value })}
            className="field font-mono-tight rounded-xl px-3 py-2.5 text-[13px] outline-none"
          />
          <input
            required placeholder="What should Kora do?"
            value={form.trigger_text}
            onChange={(e) => setForm({ ...form, trigger_text: e.target.value })}
            className="field rounded-xl px-3 py-2.5 text-[13px] outline-none"
          />
          <button className="btn-primary rounded-xl px-4 py-2.5 text-[13px]">Add</button>
        </div>
      </form>

      <div className="glass-soft divide-y divide-border/60 rounded-2xl">
        {rules.length === 0 && (
          <div className="p-8 text-center text-[14px] text-muted-foreground">
            <span className="font-serif-italic">No rules yet.</span>
          </div>
        )}
        {rules.map((r) => (
          <div key={r.id} className="flex items-center gap-3 p-4 text-[14px]">
            <span className="w-28 truncate text-foreground">{r.name}</span>
            <span className="font-mono-tight w-32 text-[11px] text-muted-foreground">{r.cron}</span>
            <span className="font-serif-italic flex-1 truncate text-[14px]">{r.trigger_text}</span>
            <span className="font-mono-tight text-[11px] text-muted-foreground">
              {r.last_fired_at ? `fired ${new Date(r.last_fired_at).toLocaleTimeString()}` : "—"}
            </span>
            <button
              onClick={async () => { await del({ data: { id: r.id } }); qc.invalidateQueries({ queryKey: ["rules"] }); }}
              className="font-mono-tight rounded-full px-2 py-1 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </ModuleShell>
  );
}
