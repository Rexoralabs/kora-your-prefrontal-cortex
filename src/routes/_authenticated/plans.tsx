import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listPlans } from "@/lib/agent.functions";
import { ModuleShell, ModuleError } from "@/components/ModuleShell";

const plansQO = queryOptions({ queryKey: ["plans"], queryFn: () => listPlans(), refetchInterval: 3500 });

export const Route = createFileRoute("/_authenticated/plans")({
  loader: ({ context }) => context.queryClient.ensureQueryData(plansQO),
  component: PlansPage,
  errorComponent: ModuleError,
});

function statusTone(s: string) {
  if (s === "completed" || s === "succeeded") return "border-ok/40 text-ok bg-ok/5";
  if (s === "failed") return "border-error/40 text-error bg-error/5";
  if (s === "running") return "border-info/40 text-info bg-info/5";
  return "border-warn/40 text-warn bg-warn/5";
}

function PlansPage() {
  const { data: plans } = useSuspenseQuery(plansQO);
  return (
    <ModuleShell
      eyebrow="plans"
      title="execution plans"
      caption={<>each plan is a DAG kora authored, ran, and self-healed.</>}
    >
      <div className="glass-soft divide-y divide-border/60 rounded-2xl">
        {plans.length === 0 && (
          <div className="p-8 text-center text-[14px] text-muted-foreground">
            <span className="font-serif-italic">no plans yet — give kora a goal.</span>
          </div>
        )}
        {plans.map((p) => (
          <Link
            key={p.id}
            to="/plans/$id"
            params={{ id: p.id }}
            className="lift block px-4 py-4 transition hover:bg-foreground/[0.02]"
          >
            <div className="flex items-center gap-3">
              <span className={`font-mono-tight rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${statusTone(p.status)}`}>
                {p.status}
              </span>
              <span className="flex-1 truncate text-[15px]">{p.goal}</span>
              <span className="font-mono-tight text-[11px] text-muted-foreground">
                {new Date(p.created_at).toLocaleString()}
              </span>
            </div>
            {p.error && <div className="font-mono-tight mt-2 truncate text-[11px] text-destructive">{p.error}</div>}
          </Link>
        ))}
      </div>
    </ModuleShell>
  );
}
