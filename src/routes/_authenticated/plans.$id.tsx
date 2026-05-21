import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getPlan } from "@/lib/agent.functions";

export const Route = createFileRoute("/_authenticated/plans/$id")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(planQO(params.id)),
  component: PlanDetail,
});

const planQO = (id: string) =>
  queryOptions({
    queryKey: ["plan", id],
    queryFn: () => getPlan({ data: { id } }),
    refetchInterval: 2500,
  });

function PlanDetail() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(planQO(id));
  if (!data) return <p className="text-sm text-muted-foreground">plan not found.</p>;
  const { plan, runs } = data;
  const dag = plan.dag as any;
  const nodes = dag?.nodes ?? [];

  const runsByNode: Record<string, typeof runs> = {};
  for (const r of runs) (runsByNode[r.node_id] ??= []).push(r);

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs text-muted-foreground">plan {id.slice(0, 8)}</p>
        <h1 className="text-lg text-primary">{plan.goal}</h1>
        <p className="mt-1 text-xs">
          status: <span className="text-foreground">{plan.status}</span>
        </p>
        {dag?.reasoning && (
          <p className="mt-2 text-sm text-muted-foreground italic">"{dag.reasoning}"</p>
        )}
        {plan.error && <p className="mt-2 text-sm text-destructive">{plan.error}</p>}
      </header>

      <section className="space-y-3">
        {nodes.map((n: any) => {
          const nr = runsByNode[n.id] ?? [];
          const last = nr[nr.length - 1];
          const status = last?.status ?? "pending";
          return (
            <div key={n.id} className="rounded border border-border bg-card">
              <div className="flex items-center gap-3 p-3 border-b border-border">
                <span className={`text-xs px-1.5 py-0.5 rounded border ${
                  status === "ok" ? "border-ok text-ok" :
                  status === "error" ? "border-error text-error" : "border-warn text-warn"
                }`}>{status}</span>
                <span className="text-sm text-primary">{n.name}</span>
                <span className="text-xs text-muted-foreground">#{n.id}</span>
                {n.depends_on?.length > 0 && (
                  <span className="text-xs text-muted-foreground">← {n.depends_on.join(", ")}</span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">{nr.length} attempt{nr.length === 1 ? "" : "s"}</span>
              </div>
              <p className="px-3 py-2 text-xs text-muted-foreground">{n.description}</p>
              {nr.map((r) => (
                <details key={r.id} className="border-t border-border">
                  <summary className="cursor-pointer px-3 py-2 text-xs flex gap-3">
                    <span>attempt {r.attempt}</span>
                    <span className={r.exit_code === 0 ? "text-ok" : "text-error"}>exit {r.exit_code}</span>
                    <span className="text-muted-foreground">{r.duration_ms}ms</span>
                  </summary>
                  {r.stdout && (
                    <pre className="m-3 max-h-48 overflow-auto rounded bg-input p-2 text-xs whitespace-pre-wrap text-foreground/80">{r.stdout}</pre>
                  )}
                  {r.stderr && (
                    <pre className="m-3 max-h-48 overflow-auto rounded bg-input p-2 text-xs whitespace-pre-wrap text-destructive/80">{r.stderr}</pre>
                  )}
                </details>
              ))}
            </div>
          );
        })}
      </section>
    </div>
  );
}
