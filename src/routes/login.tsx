import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight } from "@phosphor-icons/react";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        // auto-confirm enabled — try immediate sign-in
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signInErr) {
          toast.success("Account created. Sign in to continue.");
          setMode("signin");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      nav({ to: "/chat" });
    } catch (e: any) {
      toast.error(e.message ?? "Auth failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="kora-cloud-bg flex min-h-screen items-center justify-center p-6">
      <div className="glass w-full max-w-md rounded-3xl p-8">
        <div className="mb-7">
          <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-foreground text-background">
            <span className="text-sm font-medium">k</span>
          </div>
          <h1 className="text-3xl tracking-tight">
            {mode === "signin" ? "welcome back" : "say hello to kora"}
          </h1>
          <p className="font-serif-italic mt-2 text-muted-foreground">
            {mode === "signin"
              ? "your quiet co-pilot has been waiting"
              : "an extra mind that thinks ahead, so you don't have to"}
          </p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="font-mono-tight text-[11px] uppercase tracking-wider text-muted-foreground">
              email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-[15px] outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="you@somewhere.com"
            />
          </label>
          <label className="block">
            <span className="font-mono-tight text-[11px] uppercase tracking-wider text-muted-foreground">
              password
            </span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-[15px] outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="••••••••"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3 text-[15px] font-medium text-background transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "…" : mode === "signin" ? "sign in" : "create account"}
            {!busy && <ArrowRight weight="bold" size={16} />}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="font-mono-tight mt-5 w-full text-center text-[12px] text-muted-foreground underline-offset-4 hover:underline"
        >
          {mode === "signin" ? "no account yet — create one" : "have an account — sign in"}
        </button>
        <p className="font-serif-italic mt-6 text-center text-xs text-muted-foreground">
          no email verification. you're in the moment you sign up.
        </p>
      </div>
    </main>
  );
}
