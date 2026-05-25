import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listTaskRuns } from "@/lib/agent.functions";
import { ModuleShell, ModuleError } from "@/components/ModuleShell";

const logsQO = queryOptions({ queryKey: ["logs"], queryFn: () => listTaskRuns(), refetchInterval: 3500 });

export const Route = createFileRoute("/_authenticated/logs")({
  loader: ({ context }) => context.queryClient.ensureQueryData(logsQO),
  component: LogsPage,
  errorComponent: ModuleError,
});

function LogsPage() {
  const { data: runs } = useSuspenseQuery(logsQO);
  return (
    <ModuleShell
      eyebrow="Logs"
      title="Execution Trace"
      caption={<>Every sandbox run Kora attempted, with exit codes and durations.</>}
    >
      <div className="glass-soft overflow-hidden rounded-2xl">
        <table className="w-full text-[13px]">
          <thead className="bg-foreground/[0.03] text-muted-foreground">
            <tr>
              <th className="p-3 text-left font-mono-tight text-[11px] uppercase tracking-wider">Time</th>
              <th className="p-3 text-left font-mono-tight text-[11px] uppercase tracking-wider">Node</th>
              <th className="p-3 text-left font-mono-tight text-[11px] uppercase tracking-wider">Tool</th>
              <th className="p-3 font-mono-tight text-[11px] uppercase tracking-wider">Attempt</th>
              <th className="p-3 font-mono-tight text-[11px] uppercase tracking-wider">Exit</th>
              <th className="p-3 font-mono-tight text-[11px] uppercase tracking-wider">ms</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {runs.map((r) => (
              <tr key={r.id} className="hover:bg-foreground/[0.02]">
                <td className="p-3 font-mono-tight text-muted-foreground">{new Date(r.created_at).toLocaleTimeString()}</td>
                <td className="p-3">{r.node_id}</td>
                <td className="p-3 text-foreground">{r.tool_name}</td>
                <td className="p-3 text-center">{r.attempt}</td>
                <td className={`p-3 text-center font-mono-tight ${r.exit_code === 0 ? "text-ok" : "text-error"}`}>{r.exit_code}</td>
                <td className="p-3 text-center font-mono-tight text-muted-foreground">{r.duration_ms}</td>
                <td className="p-3">
                  {r.plan_id && (
                    <Link to="/plans/$id" params={{ id: r.plan_id }} className="text-info underline-offset-4 hover:underline">
                      Plan
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs.length === 0 && (
          <div className="p-8 text-center text-[14px] text-muted-foreground">
            <span className="font-serif-italic">No runs yet.</span>
          </div>
        )}
      </div>
    </ModuleShell>
  );
}
