import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getPlan } from "@/lib/agent.functions";
import { ModuleShell, ModuleError } from "@/components/ModuleShell";

export const Route = createFileRoute("/_authenticated/plans/$id")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(planQO(params.id)),
  component: PlanDetail,
  errorComponent: ModuleError,
});

const planQO = (id: string) =>
  queryOptions({
    queryKey: ["plan", id],
    queryFn: () => getPlan({ data: { id } }),
    refetchInterval: 2500,
  });

function statusTone(s: string) {
  if (s === "ok") return "border-ok/40 text-ok bg-ok/5";
  if (s === "error") return "border-error/40 text-error bg-error/5";
  if (s === "running") return "border-info/40 text-info bg-info/5";
  return "border-warn/40 text-warn bg-warn/5";
}

function PlanDetail() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(planQO(id));

  if (!data) {
    return (
      <ModuleShell eyebrow="Plan" title="Not Found">
        <p className="font-serif-italic text-muted-foreground">That plan drifted away.</p>
      </ModuleShell>
    );
  }

  const { plan, runs } = data;
  const dag = plan.dag as any;
  const nodes = dag?.nodes ?? [];
  const runsByNode: Record<string, typeof runs> = {};
  for (const r of runs) (runsByNode[r.node_id] ??= []).push(r);

  return (
    <ModuleShell
      eyebrow={`Plan · ${id.slice(0, 8)}`}
      title={plan.goal}
      caption={dag?.reasoning && <>"{dag.reasoning}"</>}
    >
      <div className="glass-soft flex items-center gap-3 rounded-2xl px-4 py-3">
        <span className="eyebrow">Status</span>
        <span className={`font-mono-tight rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wider ${statusTone(plan.status)}`}>
          {plan.status}
        </span>
        {plan.error && <span className="ml-2 truncate text-[13px] text-destructive">{plan.error}</span>}
      </div>

      <section className="space-y-3">
        {nodes.map((n: any) => {
          const nr = runsByNode[n.id] ?? [];
          const last = nr[nr.length - 1];
          const status = last?.status ?? "pending";
          return (
            <div key={n.id} className="glass-soft overflow-hidden rounded-2xl">
              <div className="flex items-center gap-3 border-b border-border/40 p-4">
                <span className={`font-mono-tight rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${statusTone(status)}`}>
                  {status}
                </span>
                <span className="text-[15px] text-foreground">{n.name}</span>
                <span className="font-mono-tight text-[11px] text-muted-foreground">#{n.id}</span>
                {n.depends_on?.length > 0 && (
                  <span className="font-mono-tight text-[11px] text-muted-foreground">
                    ← {n.depends_on.join(", ")}
                  </span>
                )}
                <span className="font-mono-tight ml-auto text-[11px] text-muted-foreground">
                  {nr.length} attempt{nr.length === 1 ? "" : "s"}
                </span>
              </div>
              {n.description && (
                <p className="font-serif-italic px-4 py-3 text-[14px] text-muted-foreground">
                  {n.description}
                </p>
              )}
              {nr.map((r) => (
                <details key={r.id} className="border-t border-border/40">
                  <summary className="font-mono-tight flex cursor-pointer gap-3 px-4 py-2 text-[12px]">
                    <span>attempt {r.attempt}</span>
                    <span className={r.exit_code === 0 ? "text-ok" : "text-error"}>exit {r.exit_code}</span>
                    <span className="text-muted-foreground">{r.duration_ms}ms</span>
                  </summary>
                  {r.stdout && (
                    <pre className="font-mono-tight m-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-foreground/[0.04] p-3 text-[11px] text-foreground/80">
                      {r.stdout}
                    </pre>
                  )}
                  {r.stderr && (
                    <pre className="font-mono-tight m-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-destructive/5 p-3 text-[11px] text-destructive/80">
                      {r.stderr}
                    </pre>
                  )}
                </details>
              ))}
            </div>
          );
        })}
      </section>
    </ModuleShell>
  );
}
