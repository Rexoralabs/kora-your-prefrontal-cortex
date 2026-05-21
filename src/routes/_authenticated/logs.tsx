import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listTaskRuns } from "@/lib/agent.functions";

const logsQO = queryOptions({ queryKey: ["logs"], queryFn: () => listTaskRuns(), refetchInterval: 3000 });

export const Route = createFileRoute("/_authenticated/logs")({
  loader: ({ context }) => context.queryClient.ensureQueryData(logsQO),
  component: LogsPage,
});

function LogsPage() {
  const { data: runs } = useSuspenseQuery(logsQO);
  return (
    <div className="space-y-4">
      <h1 className="text-lg text-primary">// logs</h1>
      <div className="rounded border border-border bg-card overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-input text-muted-foreground">
            <tr><th className="p-2 text-left">time</th><th className="p-2 text-left">node</th><th className="p-2 text-left">tool</th><th className="p-2">attempt</th><th className="p-2">exit</th><th className="p-2">ms</th><th></th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="p-2 text-muted-foreground">{new Date(r.created_at).toLocaleTimeString()}</td>
                <td className="p-2">{r.node_id}</td>
                <td className="p-2 text-primary">{r.tool_name}</td>
                <td className="p-2 text-center">{r.attempt}</td>
                <td className={`p-2 text-center ${r.exit_code === 0 ? "text-ok" : "text-error"}`}>{r.exit_code}</td>
                <td className="p-2 text-center text-muted-foreground">{r.duration_ms}</td>
                <td className="p-2"><Link to="/plans/$id" params={{ id: r.plan_id! }} className="text-info underline">plan</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs.length === 0 && <div className="p-4 text-sm text-muted-foreground">no runs yet.</div>}
      </div>
    </div>
  );
}
