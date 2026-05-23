import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ingestSignal, listSignals } from "@/lib/agent.functions";
import { ModuleShell, ModuleError } from "@/components/ModuleShell";

const signalsQO = queryOptions({ queryKey: ["signals"], queryFn: () => listSignals() });

export const Route = createFileRoute("/_authenticated/inbox")({
  loader: ({ context }) => context.queryClient.ensureQueryData(signalsQO),
  component: InboxPage,
  errorComponent: ModuleError,
});

function InboxPage() {
  const { data: signals } = useSuspenseQuery(signalsQO);
  const ingest = useServerFn(ingestSignal);
  const qc = useQueryClient();
  const nav = useNavigate();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await ingest({ data: { text, source: "manual", priority: "normal", autorun: true } });
      toast.success("signal ingested — reasoning…");
      setText("");
      qc.invalidateQueries({ queryKey: ["signals"] });
      qc.invalidateQueries({ queryKey: ["plans"] });
      if (res?.plan_id) nav({ to: "/plans/$id", params: { id: res.plan_id } });
    } catch (e: any) {
      toast.error(e.message ?? "ingest failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModuleShell
      eyebrow="inbox"
      title="capture a signal"
      caption={<>drop a thought, a task, or a worry — kora plans the rest.</>}
    >
      <form onSubmit={submit} className="glass rounded-2xl p-2">
        <div className="field rounded-xl p-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='"Find the 3 most urgent unread emails and summarize each in one line."'
            rows={4}
            className="w-full resize-none bg-transparent px-3 py-2 text-[15px] outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex items-center justify-between gap-3 px-2 pt-2">
          <p className="font-serif-italic text-[13px] text-muted-foreground">
            kora plans, writes code, runs it in an isolated sandbox.
          </p>
          <button
            disabled={busy || !text.trim()}
            className="btn-primary rounded-xl px-4 py-2 text-[13px] disabled:opacity-40"
          >
            {busy ? "reasoning…" : "ingest"}
          </button>
        </div>
      </form>

      <section>
        <p className="eyebrow mb-3">recent signals</p>
        <div className="glass-soft divide-y divide-border/60 rounded-2xl">
          {signals.length === 0 && (
            <div className="p-6 text-center text-[14px] text-muted-foreground">
              <span className="font-serif-italic">nothing yet — your inbox is calm.</span>
            </div>
          )}
          {signals.map((s) => (
            <div key={s.id} className="flex items-start gap-3 p-4 text-[14px]">
              <span
                className={`font-mono-tight rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                  s.status === "planned" ? "border-info/40 text-info" :
                  s.status === "received" ? "border-warn/40 text-warn" :
                  "border-border text-muted-foreground"
                }`}
              >
                {s.status}
              </span>
              <span className="font-mono-tight text-[11px] text-muted-foreground">{s.source}</span>
              <p className="line-clamp-2 flex-1">{s.raw_text}</p>
              <span className="font-mono-tight text-[11px] text-muted-foreground">
                {new Date(s.created_at).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </section>
    </ModuleShell>
  );
}
