import { ReactNode, useEffect, useRef } from "react";
import gsap from "gsap";

/**
 * Standardized page shell for every authenticated module.
 * GSAP-orchestrated enter: header + body rise softly, staggered for a
 * premium spatial feel.
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
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!root.current) return;
    const ctx = gsap.context(() => {
      const targets = root.current!.querySelectorAll<HTMLElement>("[data-shell-rise]");
      gsap.fromTo(
        targets,
        { y: 14, autoAlpha: 0, filter: "blur(6px)" },
        {
          y: 0,
          autoAlpha: 1,
          filter: "blur(0px)",
          duration: 0.7,
          stagger: 0.07,
          ease: "expo.out",
        },
      );
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <div className="relative min-h-[calc(100vh-72px)]" ref={root}>
      <div className="mx-auto max-w-5xl space-y-6">
        <header
          className="flex flex-wrap items-end justify-between gap-4 pt-2"
          data-shell-rise
        >
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
        <div data-shell-rise>{children}</div>
      </div>
    </div>
  );
}

export function ModuleError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="page-enter mx-auto max-w-2xl pt-10">
      <div className="glass rounded-3xl p-8">
        <p className="eyebrow">Something Stalled</p>
        <h2 className="mt-2 text-2xl tracking-tight">A Small Hiccup</h2>
        <p className="font-serif-italic mt-2 text-muted-foreground">
          This module couldn't load right now — usually a transient network blip.
        </p>
        <pre className="font-mono-tight mt-4 max-h-40 overflow-auto rounded-xl bg-muted/60 p-3 text-[11px] text-muted-foreground">
{String(error?.message ?? error)}
        </pre>
        <button onClick={reset} className="btn-primary mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm">
          Try Again
        </button>
      </div>
    </div>
  );
}
