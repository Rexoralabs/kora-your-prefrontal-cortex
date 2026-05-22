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
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
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
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3">
          <Link to="/chat" className="mr-3 flex items-baseline gap-1.5">
            <span className="text-lg font-medium tracking-tight">kora</span>
            <span className="font-serif-italic text-xs text-muted-foreground">co-pilot</span>
          </Link>
          <nav className="flex flex-wrap gap-1">
            {TABS.map(({ to, label, Icon }) => {
              const active = path === to || path.startsWith(to + "/");
              return (
                <Link
                  key={to}
                  to={to}
                  className={`group inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition ${
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] text-muted-foreground hover:text-destructive"
          >
            <SignOut size={14} /> logout
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
