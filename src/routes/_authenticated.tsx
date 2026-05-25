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
  GearSix,
  SignOut,
} from "@phosphor-icons/react";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    // Use getSession (synchronous read from localStorage) instead of getUser
    // (network call) so the guard never races a fresh sign-in.
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) {
      throw redirect({ to: "/login" });
    }
  },
  component: AuthedLayout,
});

const TABS = [
  { to: "/chat", label: "Chat", Icon: ChatCircle },
  { to: "/inbox", label: "Inbox", Icon: Tray },
  { to: "/now", label: "Now", Icon: Target },
  { to: "/plans", label: "Plans", Icon: ListChecks },
  { to: "/skills", label: "Skills", Icon: Sparkle },
  { to: "/memory", label: "Memory", Icon: Brain },
  { to: "/rules", label: "Rules", Icon: CalendarBlank },
  { to: "/vault", label: "Vault", Icon: Lock },
  { to: "/logs", label: "Logs", Icon: Terminal },
  { to: "/settings", label: "Settings", Icon: GearSix },
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
              Co-Pilot
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
            aria-label="Sign Out"
          >
            <SignOut size={14} />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
