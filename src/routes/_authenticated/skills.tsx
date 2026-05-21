import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listSkills } from "@/lib/agent.functions";

const skillsQO = queryOptions({ queryKey: ["skills"], queryFn: () => listSkills() });

export const Route = createFileRoute("/_authenticated/skills")({
  loader: ({ context }) => context.queryClient.ensureQueryData(skillsQO),
  component: SkillsPage,
});

function SkillsPage() {
  const { data: skills } = useSuspenseQuery(skillsQO);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg text-primary">// skills</h1>
        <p className="text-xs text-muted-foreground">Autonomously written code Kora has learned and cached.</p>
      </div>
      <div className="space-y-3">
        {skills.length === 0 && <p className="text-sm text-muted-foreground">no skills learned yet.</p>}
        {skills.map((s) => (
          <details key={s.id} className="rounded border border-border bg-card">
            <summary className="cursor-pointer p-3 flex items-center gap-3 text-sm">
              <span className="text-primary">{s.name}</span>
              <span className="text-xs text-muted-foreground">{s.language}</span>
              <span className="ml-auto text-xs">
                <span className="text-ok">✓{s.success_count}</span>{" "}
                <span className="text-error">✗{s.fail_count}</span>
              </span>
            </summary>
            <p className="px-3 pb-2 text-xs text-muted-foreground">{s.description}</p>
            {s.code && (
              <pre className="m-3 max-h-80 overflow-auto rounded bg-input p-3 text-xs whitespace-pre-wrap">{s.code}</pre>
            )}
          </details>
        ))}
      </div>
    </div>
  );
}
