import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { listChronosRules, upsertChronosRule, deleteChronosRule } from "@/lib/agent.functions";

const rulesQO = queryOptions({ queryKey: ["rules"], queryFn: () => listChronosRules() });

export const Route = createFileRoute("/_authenticated/rules")({
  loader: ({ context }) => context.queryClient.ensureQueryData(rulesQO),
  component: RulesPage,
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
      toast.success("rule saved");
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg text-primary">// chronos rules</h1>
        <p className="text-xs text-muted-foreground">Proactive triggers. Cron is UTC, 5-field. Polled every minute.</p>
      </div>
      <form onSubmit={save} className="rounded border border-border bg-card p-4 grid gap-2 md:grid-cols-[1fr_120px_2fr_auto]">
        <input required placeholder="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="rounded bg-input border border-border px-2 py-1.5 text-sm" />
        <input required placeholder="0 9 * * *" value={form.cron} onChange={(e) => setForm({ ...form, cron: e.target.value })}
          className="rounded bg-input border border-border px-2 py-1.5 text-sm" />
        <input required placeholder="What should Kora do?" value={form.trigger_text}
          onChange={(e) => setForm({ ...form, trigger_text: e.target.value })}
          className="rounded bg-input border border-border px-2 py-1.5 text-sm" />
        <button className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground">$ add</button>
      </form>
      <div className="rounded border border-border divide-y divide-border">
        {rules.length === 0 && <div className="p-4 text-sm text-muted-foreground">no rules yet.</div>}
        {rules.map((r) => (
          <div key={r.id} className="p-3 text-sm flex items-center gap-3">
            <span className="text-primary w-28 truncate">{r.name}</span>
            <span className="text-xs text-muted-foreground w-32">{r.cron}</span>
            <span className="flex-1 text-foreground truncate">{r.trigger_text}</span>
            <span className="text-xs text-muted-foreground">
              {r.last_fired_at ? `fired ${new Date(r.last_fired_at).toLocaleTimeString()}` : "—"}
            </span>
            <button onClick={async () => { await del({ data: { id: r.id } }); qc.invalidateQueries({ queryKey: ["rules"] }); }}
              className="text-xs text-destructive">delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}
