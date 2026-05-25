import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { addMemory, listMemory } from "@/lib/agent.functions";
import { ModuleShell, ModuleError } from "@/components/ModuleShell";

const memQO = queryOptions({ queryKey: ["memory"], queryFn: () => listMemory() });

export const Route = createFileRoute("/_authenticated/memory")({
  loader: ({ context }) => context.queryClient.ensureQueryData(memQO),
  component: MemoryPage,
  errorComponent: ModuleError,
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
      toast.success("kora will remember this");
    } catch (e: any) {
      toast.error(e.message ?? "failed");
    } finally { setBusy(false); }
  }

  return (
    <ModuleShell
      eyebrow="Memory"
      title="What Should I Remember?"
      caption={<>Facts, preferences, recurring patterns — Kora recalls these when reasoning.</>}
    >
      <form onSubmit={save} className="glass rounded-2xl p-2">
        <div className="field rounded-xl p-2">
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='"My name is Charis." / "I write standups every Monday at 9:30 UTC."'
            className="w-full resize-none bg-transparent px-3 py-2 text-[15px] outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex justify-end px-2 pt-2">
          <button disabled={busy || !text.trim()} className="btn-primary rounded-xl px-4 py-2 text-[13px] disabled:opacity-40">
            {busy ? "Storing…" : "Remember"}
          </button>
        </div>
      </form>

      <div className="glass-soft divide-y divide-border/60 rounded-2xl">
        {items.length === 0 && (
          <div className="p-8 text-center text-[14px] text-muted-foreground">
            <span className="font-serif-italic">No memories yet.</span>
          </div>
        )}
        {items.map((m) => (
          <div key={m.id} className="p-4">
            <p className="text-[15px] leading-snug">{m.text}</p>
            <p className="font-mono-tight mt-2 text-[11px] text-muted-foreground">
              {(m.metadata as any)?.kind ?? "manual"} · {new Date(m.created_at).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </ModuleShell>
  );
}
