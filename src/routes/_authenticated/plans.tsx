import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listPlans } from "@/lib/agent.functions";

const plansQO = queryOptions({ queryKey: ["plans"], queryFn: () => listPlans(), refetchInterval: 3000 });

export const Route = createFileRoute("/_authenticated/plans")({
  loader: ({ context }) => context.queryClient.ensureQueryData(plansQO),
  component: PlansPage,
});

function statusColor(s: string) {
  return s === "succeeded" ? "border-ok text-ok"
    : s === "failed" ? "border-error text-error"
    : s === "running" ? "border-info text-info"
    : "border-warn text-warn";
}

function PlansPage() {
  const { data: plans } = useSuspenseQuery(plansQO);
  return (
    <div className="space-y-4">
      <h1 className="text-lg text-primary">// plans</h1>
      <div className="rounded border border-border divide-y divide-border">
        {plans.length === 0 && <div className="p-4 text-sm text-muted-foreground">no plans yet.</div>}
        {plans.map((p) => (
          <Link key={p.id} to="/plans/$id" params={{ id: p.id }} className="block p-3 hover:bg-accent/30">
            <div className="flex items-center gap-3 text-sm">
              <span className={`text-xs px-1.5 py-0.5 rounded border ${statusColor(p.status)}`}>{p.status}</span>
              <span className="flex-1 truncate">{p.goal}</span>
              <span className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</span>
            </div>
            {p.error && <div className="mt-1 text-xs text-destructive truncate">{p.error}</div>}
          </Link>
        ))}
      </div>
    </div>
  );
}
