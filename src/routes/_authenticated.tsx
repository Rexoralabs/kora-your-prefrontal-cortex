import { createFileRoute, redirect, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  ChatCircle,
  Tray,
  Target,
  ListChecks,
  Sparkle,
  Brain,
  CalendarBlank,
  Lock,
  Terminal,
  SignOut,
} from "@phosphor-icons/react";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    // Give the local session a moment to hydrate on a fresh page load
    // (Supabase reads from localStorage synchronously on the client, but
    // getUser may transiently fail on a cold worker). Only redirect when
    // we're confident there is no user.
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        // Network/transient error — keep the user where they are if a session token exists.
        const { data: s } = await supabase.auth.getSession();
        if (s.session?.user) return;
        throw redirect({ to: "/login" });
      }
      if (!data.user) throw redirect({ to: "/login" });
    } catch (e) {
      // Re-throw redirects, swallow other transient errors when a session is cached
      if ((e as any)?.isRedirect) throw e;
      const { data: s } = await supabase.auth.getSession();
      if (!s.session?.user) throw redirect({ to: "/login" });
    }
  },
  component: AuthedLayout,
});

const TABS = [
  { to: "/chat", label: "chat", Icon: ChatCircle },
  { to: "/inbox", label: "inbox", Icon: Tray },
  { to: "/now", label: "now", Icon: Target },
  { to: "/plans", label: "plans", Icon: ListChecks },
  { to: "/skills", label: "skills", Icon: Sparkle },
  { to: "/memory", label: "memory", Icon: Brain },
  { to: "/rules", label: "rules", Icon: CalendarBlank },
  { to: "/vault", label: "vault", Icon: Lock },
  { to: "/logs", label: "logs", Icon: Terminal },
] as const;

function AuthedLayout() {
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  async function logout() {
    await supabase.auth.signOut();
    nav({ to: "/login" });
  }
  return (
    <div className="kora-cloud-bg relative min-h-screen text-foreground">
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-5 sm:pt-4">
        <div className="glass-pill mx-auto flex max-w-6xl items-center gap-3 rounded-full px-3 py-2">
          <Link to="/chat" className="flex items-baseline gap-1.5 pl-2 pr-1">
            <span
              className="text-[17px] font-medium tracking-tight"
              style={{
                background:
                  "linear-gradient(135deg, var(--foreground) 0%, oklch(0.55 0.22 38) 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              kora
            </span>
            <span className="font-serif-italic text-[13px] text-muted-foreground">
              co-pilot
            </span>
          </Link>

          <nav className="scrollbar-none flex flex-1 items-center gap-0.5 overflow-x-auto">
            {TABS.map(({ to, label, Icon }) => {
              const active = path === to || path.startsWith(to + "/");
              return (
                <Link
                  key={to}
                  to={to}
                  className={`btn-ghost inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] tracking-tight ${
                    active
                      ? "bg-foreground text-background shadow-soft"
                      : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                  }`}
                >
                  <Icon weight={active ? "fill" : "regular"} size={14} />
                  {label}
                </Link>
              );
            })}
          </nav>

          <button
            onClick={logout}
            className="btn-ghost inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label="sign out"
          >
            <SignOut size={14} />
            <span className="hidden sm:inline">sign out</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
