import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { getUserState, setUserState } from "@/lib/agent.functions";

const stateQO = queryOptions({ queryKey: ["state"], queryFn: () => getUserState() });

export const Route = createFileRoute("/_authenticated/now")({
  loader: ({ context }) => context.queryClient.ensureQueryData(stateQO),
  component: NowPage,
});

function NowPage() {
  const { data } = useSuspenseQuery(stateQO);
  const setFn = useServerFn(setUserState);
  const qc = useQueryClient();
  const [focus, setFocus] = useState(data?.focus ?? "");
  useEffect(() => setFocus(data?.focus ?? ""), [data?.focus]);

  async function save() {
    await setFn({ data: { focus: focus.trim() || null } });
    toast.success("focus updated");
    qc.invalidateQueries({ queryKey: ["state"] });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg text-primary">// now</h1>
      <div className="rounded border border-border bg-card p-4 space-y-3">
        <label className="block text-xs text-muted-foreground">Current focus</label>
        <textarea
          value={focus} onChange={(e) => setFocus(e.target.value)}
          rows={3}
          placeholder="What are you working on right now? Kora uses this when reasoning."
          className="w-full rounded bg-input border border-border px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <div className="flex justify-between items-center text-xs">
          <span className="text-muted-foreground">
            last active: {data?.last_active ? new Date(data.last_active).toLocaleString() : "—"}
          </span>
          <button onClick={save} className="rounded bg-primary px-3 py-1.5 text-primary-foreground">$ save</button>
        </div>
      </div>
    </div>
  );
}
