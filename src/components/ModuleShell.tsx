import { ReactNode } from "react";

/**
 * Standardized page shell for every authenticated module.
 * Provides the Neural Expressive backdrop + a soft page-enter animation.
 */
export function ModuleShell({
  eyebrow,
  title,
  caption,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  caption?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-[calc(100vh-72px)]">
      <div className="page-enter mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4 pt-2">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="mt-1 text-[34px] leading-none tracking-tight">
              {title}
            </h1>
            {caption && (
              <p className="font-serif-italic mt-2 text-[17px] text-muted-foreground">
                {caption}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
        {children}
      </div>
    </div>
  );
}

export function ModuleError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="page-enter mx-auto max-w-2xl pt-10">
      <div className="glass rounded-3xl p-8">
        <p className="eyebrow">something stalled</p>
        <h2 className="mt-2 text-2xl tracking-tight">a small hiccup</h2>
        <p className="font-serif-italic mt-2 text-muted-foreground">
          this module couldn't load right now — usually a transient network blip.
        </p>
        <pre className="font-mono-tight mt-4 max-h-40 overflow-auto rounded-xl bg-muted/60 p-3 text-[11px] text-muted-foreground">
{String(error?.message ?? error)}
        </pre>
        <button onClick={reset} className="btn-primary mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm">
          try again
        </button>
      </div>
    </div>
  );
}
