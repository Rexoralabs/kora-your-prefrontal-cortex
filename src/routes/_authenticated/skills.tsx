import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listSkills } from "@/lib/agent.functions";
import { ModuleShell, ModuleError } from "@/components/ModuleShell";

const skillsQO = queryOptions({ queryKey: ["skills"], queryFn: () => listSkills() });

export const Route = createFileRoute("/_authenticated/skills")({
  loader: ({ context }) => context.queryClient.ensureQueryData(skillsQO),
  component: SkillsPage,
  errorComponent: ModuleError,
});

function SkillsPage() {
  const { data: skills } = useSuspenseQuery(skillsQO);
  return (
    <ModuleShell
      eyebrow="Skills"
      title="Learned Skills"
      caption={<>Code Kora wrote, validated, and cached — promoted from successful runs.</>}
    >
      <div className="space-y-3">
        {skills.length === 0 && (
          <div className="glass-soft rounded-2xl p-8 text-center text-[14px] text-muted-foreground">
            <span className="font-serif-italic">No skills learned yet — ask Kora to do something.</span>
          </div>
        )}
        {skills.map((s) => (
          <details key={s.id} className="glass-soft rounded-2xl overflow-hidden">
            <summary className="lift flex cursor-pointer items-center gap-3 p-4 text-[15px]">
              <span className="text-foreground">{s.name}</span>
              <span className="font-mono-tight rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                {s.language}
              </span>
              <span className="font-serif-italic ml-auto text-[13px]">
                <span className="text-ok">✓ {s.success_count}</span>
                <span className="mx-1 text-muted-foreground">·</span>
                <span className="text-error">✗ {s.fail_count}</span>
              </span>
            </summary>
            {s.description && (
              <p className="font-serif-italic px-4 pb-2 text-[14px] text-muted-foreground">{s.description}</p>
            )}
            {s.code && (
              <pre className="font-mono-tight m-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-foreground/[0.04] p-4 text-[12px] leading-relaxed">
                {s.code}
              </pre>
            )}
          </details>
        ))}
      </div>
    </ModuleShell>
  );
}
