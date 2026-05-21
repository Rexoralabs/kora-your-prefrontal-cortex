import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ingestSignal, listSignals } from "@/lib/agent.functions";

const signalsQO = queryOptions({ queryKey: ["signals"], queryFn: () => listSignals() });

export const Route = createFileRoute("/_authenticated/inbox")({
  loader: ({ context }) => context.queryClient.ensureQueryData(signalsQO),
  component: InboxPage,
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
      toast.success("Signal ingested, reasoning…");
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
    <div className="space-y-6">
      <section>
        <h1 className="text-lg text-primary mb-2">// inbox</h1>
        <form onSubmit={submit} className="rounded border border-border bg-card p-4 space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='Tell Kora what to do. e.g. "Find the 3 most urgent unread emails and summarize each in one line."'
            rows={4}
            className="w-full rounded bg-input border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">Kora will plan + write code + execute in an isolated sandbox.</p>
            <button disabled={busy} className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">
              {busy ? "reasoning…" : "$ ingest"}
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Recent signals</h2>
        <div className="rounded border border-border divide-y divide-border">
          {signals.length === 0 && <div className="p-4 text-sm text-muted-foreground">no signals yet.</div>}
          {signals.map((s) => (
            <div key={s.id} className="p-3 text-sm flex items-start gap-3">
              <span className={`text-xs px-1.5 py-0.5 rounded border ${
                s.status === "planned" ? "border-info text-info" :
                s.status === "received" ? "border-warn text-warn" :
                "border-border text-muted-foreground"
              }`}>{s.status}</span>
              <span className="text-xs text-muted-foreground">{s.source}</span>
              <p className="flex-1 text-foreground line-clamp-2">{s.raw_text}</p>
              <span className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
