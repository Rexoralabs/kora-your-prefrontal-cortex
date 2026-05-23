import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { listVaultNames, setVaultSecret, removeVaultSecret } from "@/lib/agent.functions";
import { ModuleShell, ModuleError } from "@/components/ModuleShell";

const vaultQO = queryOptions({ queryKey: ["vault"], queryFn: () => listVaultNames() });

export const Route = createFileRoute("/_authenticated/vault")({
  loader: ({ context }) => context.queryClient.ensureQueryData(vaultQO),
  component: VaultPage,
  errorComponent: ModuleError,
});

function VaultPage() {
  const { data: names } = useSuspenseQuery(vaultQO);
  const set = useServerFn(setVaultSecret);
  const rm = useServerFn(removeVaultSecret);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await set({ data: { name, value } });
      setName(""); setValue("");
      qc.invalidateQueries({ queryKey: ["vault"] });
      toast.success("secret stored — encrypted at rest");
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <ModuleShell
      eyebrow="vault"
      title="credentials, encrypted"
      caption={<>per-user secrets, AES-GCM, injected into the sandbox only when a skill names them.</>}
    >
      <form onSubmit={save} className="glass rounded-2xl p-3">
        <div className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
          <input
            required
            placeholder="GMAIL_OAUTH_TOKEN"
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase())}
            className="field font-mono-tight rounded-xl px-3 py-2.5 text-[13px] outline-none"
          />
          <input
            required
            placeholder="value"
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="field rounded-xl px-3 py-2.5 text-[13px] outline-none"
          />
          <button className="btn-primary rounded-xl px-4 py-2.5 text-[13px]">store</button>
        </div>
      </form>

      <div className="glass-soft divide-y divide-border/60 rounded-2xl">
        {names.length === 0 && (
          <div className="p-8 text-center text-[14px] text-muted-foreground">
            <span className="font-serif-italic">vault is empty.</span>
          </div>
        )}
        {names.map((n) => (
          <div key={n} className="flex items-center gap-3 p-4 text-[14px]">
            <span className="font-mono-tight flex-1 text-foreground">{n}</span>
            <span className="font-mono-tight text-[11px] text-muted-foreground">●●●●●●</span>
            <button
              onClick={async () => { await rm({ data: { name: n } }); qc.invalidateQueries({ queryKey: ["vault"] }); }}
              className="font-mono-tight rounded-full px-2 py-1 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              remove
            </button>
          </div>
        ))}
      </div>
    </ModuleShell>
  );
}
