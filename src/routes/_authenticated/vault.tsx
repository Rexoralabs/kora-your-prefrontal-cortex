import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { listVaultNames, setVaultSecret, removeVaultSecret } from "@/lib/agent.functions";

const vaultQO = queryOptions({ queryKey: ["vault"], queryFn: () => listVaultNames() });

export const Route = createFileRoute("/_authenticated/vault")({
  loader: ({ context }) => context.queryClient.ensureQueryData(vaultQO),
  component: VaultPage,
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
      toast.success("secret stored (encrypted)");
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg text-primary">// vault</h1>
        <p className="text-xs text-muted-foreground">Per-user credentials. Encrypted at rest (AES-GCM). Injected into the sandbox at runtime when a skill requests them by name.</p>
      </div>
      <form onSubmit={save} className="rounded border border-border bg-card p-4 grid gap-2 md:grid-cols-[1fr_2fr_auto]">
        <input required placeholder="GMAIL_OAUTH_TOKEN" value={name} onChange={(e) => setName(e.target.value.toUpperCase())}
          className="rounded bg-input border border-border px-2 py-1.5 text-sm font-mono" />
        <input required placeholder="value" type="password" value={value} onChange={(e) => setValue(e.target.value)}
          className="rounded bg-input border border-border px-2 py-1.5 text-sm" />
        <button className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground">$ store</button>
      </form>
      <div className="rounded border border-border divide-y divide-border">
        {names.length === 0 && <div className="p-4 text-sm text-muted-foreground">vault is empty.</div>}
        {names.map((n) => (
          <div key={n} className="p-3 text-sm flex items-center gap-3">
            <span className="text-primary flex-1">{n}</span>
            <span className="text-xs text-muted-foreground">******</span>
            <button onClick={async () => { await rm({ data: { name: n } }); qc.invalidateQueries({ queryKey: ["vault"] }); }}
              className="text-xs text-destructive">remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}
