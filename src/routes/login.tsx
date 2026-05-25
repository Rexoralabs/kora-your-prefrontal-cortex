import { createFileRoute, useNavigate, useRouter, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight } from "@phosphor-icons/react";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) throw redirect({ to: "/chat" });
    } catch (e) {
      if ((e as any)?.isRedirect) throw e;
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function go() {
    // Confirm session is persisted before navigating, so the route guard
    // never races against localStorage hydration.
    for (let i = 0; i < 8; i++) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) break;
      await new Promise((r) => setTimeout(r, 80));
    }
    await router.invalidate();
    nav({ to: "/chat", replace: true });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/chat` },
        });
        if (error) throw error;
        // Auto-confirm is on — try sign in immediately
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signInErr) {
          toast.success("Account created. Sign in to continue.");
          setMode("signin");
          return;
        }
        toast.success("Welcome to Kora");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      await go();
    } catch (e: any) {
      toast.error(e.message ?? "Auth failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="kora-cloud-bg relative flex min-h-screen items-center justify-center p-6">
      <div className="page-enter w-full max-w-md">
        <div className="glass rounded-[28px] p-9">
          <div className="mb-8">
            <div
              className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-2xl"
              style={{
                background:
                  "radial-gradient(circle at 30% 30%, oklch(0.85 0.15 60), oklch(0.55 0.22 38))",
                boxShadow:
                  "0 1px 0 rgba(255,255,255,0.55) inset, 0 12px 28px -8px color-mix(in oklab, var(--primary) 50%, transparent)",
              }}
            >
              <span className="text-[15px] font-medium text-white">k</span>
            </div>
            <h1 className="text-[34px] leading-none tracking-tight">
              {mode === "signin" ? "Welcome Back" : "Say Hello"}
            </h1>
            <p className="font-serif-italic mt-3 text-[17px] text-muted-foreground">
              {mode === "signin"
                ? "your quiet co-pilot has been waiting."
                : "an extra mind that thinks ahead — so you don't have to."}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <span className="eyebrow">Email</span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field mt-1.5 w-full rounded-xl px-4 py-3 text-[15px] outline-none"
                placeholder="you@somewhere.com"
              />
            </label>
            <label className="block">
              <span className="eyebrow">Password</span>
              <input
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field mt-1.5 w-full rounded-xl px-4 py-3 text-[15px] outline-none"
                placeholder="••••••••"
              />
            </label>
            <button
              type="submit"
              disabled={busy || !email || !password}
              className="btn-primary mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[15px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="think-dot" />
                  <span className="think-dot" />
                  <span className="think-dot" />
                </span>
              ) : (
                <>
                  {mode === "signin" ? "Sign In" : "Create Account"}
                  <ArrowRight weight="bold" size={16} />
                </>
              )}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="font-mono-tight mt-6 w-full text-center text-[12px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {mode === "signin" ? "No account yet — create one" : "Have an account — sign in"}
          </button>
          <p className="font-serif-italic mt-6 text-center text-[13px] text-muted-foreground">
            No email verification. You're in the moment you sign up.
          </p>
        </div>
      </div>
    </main>
  );
}
