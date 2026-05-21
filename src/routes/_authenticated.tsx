import { createFileRoute, redirect, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
  },
  component: AuthedLayout,
});

const TABS = [
  { to: "/inbox", label: "inbox" },
  { to: "/now", label: "now" },
  { to: "/plans", label: "plans" },
  { to: "/skills", label: "skills" },
  { to: "/memory", label: "memory" },
  { to: "/rules", label: "rules" },
  { to: "/vault", label: "vault" },
  { to: "/logs", label: "logs" },
] as const;

function AuthedLayout() {
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  async function logout() {
    await supabase.auth.signOut();
    nav({ to: "/login" });
  }
  return (
    <div className="min-h-screen bg-background text-foreground font-mono">
      <header className="border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-6 flex-wrap">
          <Link to="/inbox" className="text-primary font-bold tracking-wide">KORA</Link>
          <nav className="flex gap-1 flex-wrap">
            {TABS.map((t) => {
              const active = path.startsWith(t.to);
              return (
                <Link
                  key={t.to} to={t.to}
                  className={`px-2.5 py-1 text-xs rounded border ${active ? "border-primary text-primary bg-primary/10" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >{t.label}</Link>
              );
            })}
          </nav>
          <button onClick={logout} className="ml-auto text-xs text-muted-foreground hover:text-destructive">
            $ logout
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
