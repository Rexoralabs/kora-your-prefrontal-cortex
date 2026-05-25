import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getProfile, updateProfile } from "@/lib/profile.functions";
import { ModuleShell, ModuleError } from "@/components/ModuleShell";
import { User, SlidersHorizontal, Shield } from "@phosphor-icons/react";

const profileQO = queryOptions({ queryKey: ["profile"], queryFn: () => getProfile() });

export const Route = createFileRoute("/_authenticated/settings")({
  loader: ({ context }) => context.queryClient.ensureQueryData(profileQO),
  component: SettingsPage,
  errorComponent: ModuleError,
});

type Tab = "profile" | "preferences" | "account";

function SettingsPage() {
  const [tab, setTab] = useState<Tab>("profile");
  return (
    <ModuleShell
      eyebrow="Settings"
      title="Your Workspace"
      caption={<>Tune how Kora looks, remembers, and behaves for you.</>}
    >
      <div className="glass-soft inline-flex rounded-full p-1 text-[13px]">
        <TabBtn active={tab === "profile"} onClick={() => setTab("profile")} icon={<User size={13} />}>
          Profile
        </TabBtn>
        <TabBtn
          active={tab === "preferences"}
          onClick={() => setTab("preferences")}
          icon={<SlidersHorizontal size={13} />}
        >
          Preferences
        </TabBtn>
        <TabBtn active={tab === "account"} onClick={() => setTab("account")} icon={<Shield size={13} />}>
          Account
        </TabBtn>
      </div>

      {tab === "profile" && <ProfileTab />}
      {tab === "preferences" && <PreferencesTab />}
      {tab === "account" && <AccountTab />}
    </ModuleShell>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition ${
        active ? "bg-foreground text-background shadow-soft" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function ProfileTab() {
  const { data: profile } = useSuspenseQuery(profileQO);
  const update = useServerFn(updateProfile);
  const qc = useQueryClient();
  const [name, setName] = useState(profile?.display_name ?? "");
  const [avatar, setAvatar] = useState(profile?.avatar_url ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(profile?.display_name ?? "");
    setAvatar(profile?.avatar_url ?? "");
  }, [profile?.display_name, profile?.avatar_url]);

  async function save() {
    setBusy(true);
    try {
      await update({
        data: {
          display_name: name.trim() || null,
          avatar_url: avatar.trim() || null,
        },
      });
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile saved");
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center gap-4">
        <div
          className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl text-xl font-medium text-white"
          style={{
            background:
              "radial-gradient(circle at 30% 30%, oklch(0.85 0.15 60), oklch(0.55 0.22 38))",
          }}
        >
          {avatar ? (
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            (name || "K").slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[17px] tracking-tight">{name || "Unnamed"}</p>
          <p className="font-mono-tight text-[12px] text-muted-foreground truncate">
            id · {profile?.user_id.slice(0, 8)}…
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3">
        <label className="block">
          <span className="eyebrow">Display Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What should Kora call you?"
            className="field mt-1.5 w-full rounded-xl px-4 py-2.5 text-[14px] outline-none"
          />
        </label>
        <label className="block">
          <span className="eyebrow">Avatar URL</span>
          <input
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            placeholder="https://…"
            className="field mt-1.5 w-full rounded-xl px-4 py-2.5 text-[14px] outline-none"
          />
        </label>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          onClick={save}
          disabled={busy}
          className="btn-primary rounded-xl px-4 py-2 text-[13px] disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

function PreferencesTab() {
  const { data: profile } = useSuspenseQuery(profileQO);
  const update = useServerFn(updateProfile);
  const qc = useQueryClient();
  const prefs = (profile?.preferences as Record<string, any>) ?? {};
  const [chatMode, setChatMode] = useState<"chat" | "thinking">(prefs.default_chat_mode ?? "chat");
  const [splashEnabled, setSplashEnabled] = useState<boolean>(prefs.splash_enabled ?? true);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await update({
        data: {
          preferences: {
            ...prefs,
            default_chat_mode: chatMode,
            splash_enabled: splashEnabled,
          },
        },
      });
      qc.invalidateQueries({ queryKey: ["profile"] });
      if (!splashEnabled) {
        try {
          sessionStorage.setItem("kora.splash.shown", "1");
        } catch {}
      }
      toast.success("Preferences saved");
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass rounded-2xl p-6 space-y-5">
      <div>
        <p className="eyebrow">Default Chat Mode</p>
        <p className="font-serif-italic mt-1 text-[13px] text-muted-foreground">
          Which mode new conversations open in.
        </p>
        <div className="glass-soft mt-3 inline-flex rounded-full p-0.5 text-[12px]">
          {(["chat", "thinking"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setChatMode(m)}
              className={`rounded-full px-3.5 py-1.5 transition ${
                chatMode === m ? "bg-foreground text-background" : "text-muted-foreground"
              }`}
            >
              {m === "chat" ? "Fluid Chat" : "Deep Thinking"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Splash Animation</p>
          <p className="font-serif-italic mt-1 text-[13px] text-muted-foreground">
            Show the Kora intro animation when you open the app.
          </p>
        </div>
        <button
          onClick={() => setSplashEnabled((v) => !v)}
          className={`relative h-7 w-12 rounded-full transition ${
            splashEnabled ? "bg-foreground" : "bg-foreground/15"
          }`}
          aria-pressed={splashEnabled}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-background shadow-soft transition ${
              splashEnabled ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={busy}
          className="btn-primary rounded-xl px-4 py-2 text-[13px] disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save Preferences"}
        </button>
      </div>
    </div>
  );
}

function AccountTab() {
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  async function changePassword() {
    if (pw.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      setPw("");
      toast.success("Password updated");
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function signOutAll() {
    if (!confirm("Sign out everywhere?")) return;
    await supabase.auth.signOut({ scope: "global" });
    nav({ to: "/login", replace: true });
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-6">
        <p className="eyebrow">Change Password</p>
        <p className="font-serif-italic mt-1 text-[13px] text-muted-foreground">
          New password, applied immediately.
        </p>
        <div className="mt-4 flex gap-2">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="New password"
            className="field flex-1 rounded-xl px-4 py-2.5 text-[14px] outline-none"
          />
          <button
            onClick={changePassword}
            disabled={busy || !pw}
            className="btn-primary rounded-xl px-4 py-2 text-[13px] disabled:opacity-40"
          >
            Update
          </button>
        </div>
      </div>

      <div className="glass rounded-2xl p-6">
        <p className="eyebrow">Sessions</p>
        <p className="font-serif-italic mt-1 text-[13px] text-muted-foreground">
          End every active sign-in across all your devices.
        </p>
        <button
          onClick={signOutAll}
          className="mt-4 rounded-xl border border-destructive/30 px-4 py-2 text-[13px] text-destructive transition hover:bg-destructive/10"
        >
          Sign Out Everywhere
        </button>
      </div>
    </div>
  );
}
