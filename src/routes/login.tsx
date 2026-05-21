import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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
          email, password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account created. Check your email if confirmation is required.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      nav({ to: "/inbox" });
    } catch (e: any) {
      toast.error(e.message ?? "Auth failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen kora-grid-bg flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded border border-border bg-card/90 backdrop-blur p-6 font-mono">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-primary">KORA</h1>
          <p className="text-xs text-muted-foreground mt-1">externalized prefrontal cortex // v0.1</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-xs text-muted-foreground">
            email
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            password
            <input
              type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          <button
            type="submit" disabled={busy}
            className="w-full rounded bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "…" : mode === "signin" ? "$ login" : "$ create_account"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 text-xs text-muted-foreground underline"
        >
          {mode === "signin" ? "no account → create one" : "have an account → sign in"}
        </button>
      </div>
    </main>
  );
}
