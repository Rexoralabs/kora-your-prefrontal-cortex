import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { addMemory, listMemory } from "@/lib/agent.functions";

const memQO = queryOptions({ queryKey: ["memory"], queryFn: () => listMemory() });

export const Route = createFileRoute("/_authenticated/memory")({
  loader: ({ context }) => context.queryClient.ensureQueryData(memQO),
  component: MemoryPage,
});

function MemoryPage() {
  const { data: items } = useSuspenseQuery(memQO);
  const add = useServerFn(addMemory);
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await add({ data: { text } });
      setText("");
      qc.invalidateQueries({ queryKey: ["memory"] });
      toast.success("memory stored");
    } catch (e: any) {
      toast.error(e.message ?? "failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg text-primary">// memory</h1>
      <form onSubmit={save} className="rounded border border-border bg-card p-4 space-y-2">
        <textarea
          rows={3} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={`Persist a fact: "I'm vegetarian." / "My team standup is 9:30am UTC."`}
          className="w-full rounded bg-input border border-border px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <div className="flex justify-end">
          <button disabled={busy} className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">
            {busy ? "embedding…" : "$ remember"}
          </button>
        </div>
      </form>
      <div className="rounded border border-border divide-y divide-border">
        {items.length === 0 && <div className="p-4 text-sm text-muted-foreground">no memories.</div>}
        {items.map((m) => (
          <div key={m.id} className="p-3 text-sm">
            <p>{m.text}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {(m.metadata as any)?.kind ?? "?"} · {new Date(m.created_at).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
