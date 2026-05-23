import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { getUserState, setUserState } from "@/lib/agent.functions";
import { ModuleShell, ModuleError } from "@/components/ModuleShell";

const stateQO = queryOptions({ queryKey: ["state"], queryFn: () => getUserState() });

export const Route = createFileRoute("/_authenticated/now")({
  loader: ({ context }) => context.queryClient.ensureQueryData(stateQO),
  component: NowPage,
  errorComponent: ModuleError,
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
    <ModuleShell
      eyebrow="now"
      title="what's on your mind?"
      caption={<>kora consults this whenever it reasons about your next move.</>}
    >
      <div className="glass rounded-2xl p-5">
        <div className="field rounded-xl p-2">
          <textarea
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            rows={4}
            placeholder="e.g. shipping the Kora v0.2 release this week."
            className="w-full resize-none bg-transparent px-3 py-2 text-[15px] outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="font-mono-tight text-[11px] text-muted-foreground">
            last active: {data?.last_active ? new Date(data.last_active).toLocaleString() : "—"}
          </span>
          <button onClick={save} className="btn-primary rounded-xl px-4 py-2 text-[13px]">
            save focus
          </button>
        </div>
      </div>
    </ModuleShell>
  );
}
